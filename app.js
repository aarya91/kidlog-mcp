// KidLog web app + Claude connection in one Express app.
import express from 'express';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import * as views from './views.js';
import { handleMcp } from './mcp.js';
import * as auth from './auth.js';
import * as oauth from './oauth.js';
import * as mail from './mail.js';
import { SCHEDULES, SCHEDULE_IDS, childSchedule, nextVisit, calendarFile } from './vaccines.js';
import { recordDoses, sendReminders } from './vaccine-jobs.js';
import * as pay from './razorpay.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
// Logo and icons. On Vercel the public/ folder is served by the platform itself; this line covers other hosts.
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { maxAge: '1d', index: false }));
// Razorpay signs the exact bytes of its webhook request, so keep them for that one address.
app.use(express.json({ limit: '200kb', verify: (req, res, buf) => { if (req.originalUrl === '/razorpay/webhook') req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use((req, res, next) => {
  res.set('Referrer-Policy', 'no-referrer'); // private links must not leak to other sites
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "frame-ancestors 'none'"); // no other site may embed these pages
  res.set('X-Frame-Options', 'DENY');
  res.set('Cache-Control', 'no-store');
  next();
});

const baseUrl = (req) => process.env.PUBLIC_URL?.replace(/\/$/, '') || `${req.protocol}://${req.get('host')}`;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// "Now" in the visitor's own timezone as YYYY-MM-DDTHH:MM. The browser stores its UTC offset in a small cookie.
function localNow(req) {
  const m = /(?:^|;\s*)tz=(-?\d{1,4})(?:;|$)/.exec(req.headers.cookie || '');
  const offset = m ? Math.max(-840, Math.min(840, Number(m[1]))) : 0;
  return new Date(Date.now() + offset * 60000).toISOString().slice(0, 16);
}

const RANGE_DAYS = { 7: 7, 30: 30, 90: 90 };
// Loads everything for the board, then narrows by period and flag in memory.
// lock = { child, flaggedOnly } pins a doctor share link to its scope, whatever the query says.
// On the Free plan, records older than 90 days leave the lists: days 91 to 100 come back as `locked`
// (shown as locked cards to parents), and anything older is only counted in `hiddenCount`.
async function boardData(space, query, lock = {}) {
  const spaceId = space.id;
  const child = lock.child || db.clean(query.child, 60);
  const flagged = lock.flaggedOnly || query.flagged === '1';
  const range = RANGE_DAYS[query.range] ? String(query.range) : 'all';
  let [all, children] = await Promise.all([db.listEntries(spaceId, { child }), db.listChildren(spaceId)]);
  if (lock.child) children = children.filter((c) => c.child.toLowerCase() === lock.child.toLowerCase());
  if (lock.flaggedOnly) all = all.filter((e) => e.flagged);
  const premium = db.isPremium(space);
  let locked = [];
  let hiddenCount = 0;
  let olderTypes = []; // entry types that exist only beyond the 90 days, so the summary can say so instead of "None logged"
  if (!premium) {
    const view = db.historyCutoff(db.FREE.viewDays);
    const store = db.historyCutoff(db.FREE.storeDays);
    locked = all.filter((e) => e.occurred_at < view && e.occurred_at >= store);
    hiddenCount = all.filter((e) => e.occurred_at < store).length;
    olderTypes = [...new Set(all.filter((e) => e.occurred_at < view).map((e) => e.category))];
    all = all.filter((e) => e.occurred_at >= view);
  }
  let entries = all;
  if (range !== 'all') {
    // One spare day so "today" in any timezone is always included.
    const cutoff = new Date(Date.now() - (RANGE_DAYS[range] + 1) * 86400000).toISOString().slice(0, 16);
    entries = entries.filter((e) => e.occurred_at >= cutoff);
  }
  if (flagged) { entries = entries.filter((e) => e.flagged); locked = locked.filter((e) => e.flagged); }
  return { all, entries, children, child, flagged, range, premium, locked, hiddenCount, olderTypes };
}

app.get('/healthz', wrap(async (req, res) => { await db.init(); res.send('ok'); }));

// ---- Daily vaccine reminder emails ----
// Vercel calls this once a day (see vercel.json) and sends CRON_SECRET with it. Nobody else may trigger it.
app.get('/cron/vaccine-reminders', wrap(async (req, res) => {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).send('unauthorized');
  res.json(await sendReminders(baseUrl(req)));
}));

// ---- Razorpay webhook ----
// Razorpay reports here when a subscription starts, renews, fails for good or ends. This keeps the plan right
// even if the parent closed the browser mid-payment, or a renewal fails months later.
app.post('/razorpay/webhook', wrap(async (req, res) => {
  if (!pay.validWebhook(req.rawBody, req.get('x-razorpay-signature'))) return res.status(400).send('bad signature');
  const sub = req.body?.payload?.subscription?.entity;
  const plan = pay.PLAN_AFTER[req.body?.event];
  const space = sub?.id && plan ? await db.spaceBySubscription(sub.id) : null;
  if (space) await db.setPlan(space.id, plan, pay.periodOfPlan(sub.plan_id));
  res.send('ok'); // always 200 once the signature is good, or Razorpay keeps retrying
}));

// ---- Sign-in ----
app.use(wrap(auth.loadUser)); // sets req.user for every page below

app.get('/auth/google', (req, res) => auth.googleStart(req, res, baseUrl(req)));
app.get('/auth/google/callback', wrap((req, res) => auth.googleCallback(req, res, baseUrl(req))));
app.post('/logout', wrap(auth.logout));

// ---- Claude connection (MCP) ----
// One address for everyone. Claude signs the parent in through the OAuth pages below and sends a token with each request.
app.use(oauth.router(baseUrl)); // discovery documents, /register, /authorize, /token, /revoke
app.post('/oauth/consent', wrap(oauth.consent));
app.all('/mcp', oauth.requireToken(baseUrl), (req, res) => handleMcp(req, res, baseUrl(req)));
// The per-family links from before sign-in existed no longer work.
app.all('/mcp/:key', (req, res) => res.status(410).json({
  jsonrpc: '2.0', id: null,
  error: { code: -32000, message: `This connection link has been retired. In Claude, remove KidLog and add ${oauth.mcpUrl(baseUrl(req))} instead, then sign in.` },
}));

app.get('/privacy', (req, res) => res.send(views.privacy({ user: req.user, supportEmail: process.env.SUPPORT_EMAIL || '' })));

// ---- Public pages ----
app.get('/', wrap(async (req, res) => {
  if (!req.user) return res.send(views.landing());
  const space = await db.spaceByUser(req.user.id);
  res.redirect(303, space ? `/f/${space.key}` : '/signup');
}));

app.get('/how-it-works', (req, res) => res.send(views.howItWorks({ user: req.user })));

// ---- Sign-up: a signed-in parent names their family ----
app.get('/signup', wrap(async (req, res) => {
  if (!req.user) return res.redirect(303, '/');
  const space = await db.spaceByUser(req.user.id);
  if (space) return res.redirect(303, `/f/${space.key}`);
  res.send(views.signup({ user: req.user }));
}));

app.post('/signup', wrap(async (req, res) => {
  if (!req.user) return res.redirect(303, '/');
  const existing = await db.spaceByUser(req.user.id);
  if (existing) return res.redirect(303, `/f/${existing.key}`);
  const space = await db.createSpace(req.body?.name, req.user.id);
  const next = auth.nextUrl(req); // signed up on the way to connecting Claude: finish that first
  if (next) { auth.clearNext(req, res); return res.redirect(303, next); }
  res.redirect(303, `/f/${space.key}?welcome=1`);
}));

// ---- Invite link from another parent ----
app.get('/join/:token', wrap(async (req, res) => {
  const invite = await db.inviteByToken(req.params.token);
  if (!invite) return res.status(404).send(views.notFound('This invite link has expired or has already been used. Ask for a new one.'));
  const mine = req.user ? await db.spaceByUser(req.user.id) : null;
  if (mine && mine.id === invite.space.id) return res.redirect(303, `/f/${mine.key}`);
  res.send(views.join({ space: invite.space, token: req.params.token, user: req.user, mine }));
}));

app.post('/join/:token', wrap(async (req, res) => {
  if (!req.user) return res.redirect(303, `/join/${encodeURIComponent(req.params.token)}`);
  const space = await db.acceptInvite(req.params.token, req.user.id);
  res.redirect(303, space ? `/f/${space.key}` : `/join/${encodeURIComponent(req.params.token)}`);
}));

// ---- Family space: only signed-in parents of this family get in ----
const withSpace = wrap(async (req, res, next) => {
  const space = await db.spaceByKey(req.params.key);
  if (!space) return res.status(404).send(views.notFound('This timeline link is not valid.'));
  // A timeline made before sign-in existed: whoever holds the link signs in once to make it theirs.
  if (!space.owner_id) return res.status(req.method === 'GET' ? 200 : 403).send(views.claim({ space, user: req.user }));
  if (!req.user) return res.redirect(303, '/');
  if (!(await db.isMember(space.id, req.user.id))) return res.status(404).send(views.notFound('This timeline belongs to a different account.'));
  req.space = space;
  req.isOwner = req.user.id === space.owner_id;
  next();
});

app.get('/f/:key', withSpace, wrap(async (req, res) => {
  const [data, stamp] = await Promise.all([boardData(req.space, req.query), db.stamp(req.space.id)]);
  const now = localNow(req);
  const upcoming = await db.listAppointments(req.space.id, { child: data.child, from: now });
  // Right-panel vaccine card: the soonest visit still to be given, among the children on view.
  const inView = data.children.filter((c) => !data.child || c.child.toLowerCase() === data.child.toLowerCase());
  let vaccine = null;
  for (const c of inView) {
    if (!c.dob || !SCHEDULES[c.vaccine_schedule]) { vaccine ??= { child: c, setup: true }; continue; }
    const next = nextVisit(childSchedule(c.vaccine_schedule, c.dob, await db.givenDoses(c.id, c.vaccine_schedule), now.slice(0, 10)));
    if (next && (!vaccine || vaccine.setup || next.from < vaccine.visit.from)) vaccine = { child: c, visit: next };
    else if (!next && !vaccine) vaccine = { child: c, done: true };
  }
  res.send(views.timeline({ space: req.space, ...data, upcoming, vaccine, now, stamp, welcome: req.query.welcome === '1', upgraded: req.query.upgraded === '1' }));
}));

// ---- Plan and the demo checkout ----
// No real payment exists yet: the checkout has one button that simulates a successful payment and one that simulates a failure.
const REASONS = ['child', 'history', 'saved', 'general'];
const upgradeUrl = (space, reason, extra = '') => `/f/${space.key}/upgrade?reason=${reason}${extra}`;

app.get('/f/:key/upgrade', withSpace, (req, res) => {
  const reason = REASONS.includes(req.query.reason) ? req.query.reason : 'general';
  res.send(views.upgrade({ space: req.space, reason, failed: req.query.failed === '1', cancelFailed: req.query.cancelfailed === '1' }));
});

// Demo checkout, used only while Razorpay is not configured: one button succeeds, the other fails.
app.post('/f/:key/upgrade', withSpace, wrap(async (req, res) => {
  const reason = REASONS.includes(req.body.reason) ? req.body.reason : 'general';
  if (pay.enabled()) return res.redirect(303, upgradeUrl(req.space, reason));
  if (req.body.outcome !== 'success') return res.redirect(303, upgradeUrl(req.space, reason, '&failed=1'));
  await db.setPlan(req.space.id, 'premium', req.body.period);
  res.redirect(303, `/f/${req.space.key}${reason === 'child' ? '/kids' : ''}?upgraded=1`);
}));

// Razorpay checkout, step 1: create the subscription the parent is about to pay for.
app.post('/f/:key/upgrade/start', withSpace, wrap(async (req, res) => {
  if (!pay.enabled()) return res.status(404).json({ error: 'Payments are not set up.' });
  if (db.isPremium(req.space)) return res.status(400).json({ error: 'Your family is already on Premium.' });
  try {
    const sub = await pay.createSubscription(req.body?.period, req.space);
    await db.setSubscription(req.space.id, sub.id);
    res.json({ key: pay.keyId(), subscription_id: sub.id, email: req.user.email, description: `Premium, ${db.PRICES[sub.period].price}` });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Could not start the payment. Nothing was charged. Please try again.' });
  }
}));

// Step 2: the browser says the payment went through. Believe it only if Razorpay's signature checks out.
app.post('/f/:key/upgrade/verify', withSpace, wrap(async (req, res) => {
  const subscriptionId = req.space.razorpay_subscription_id;
  if (!pay.enabled() || !pay.validPayment({ paymentId: req.body?.payment_id, subscriptionId, signature: req.body?.signature })) {
    return res.status(400).json({ error: 'We could not confirm this payment. If money was taken, your plan will update within a few minutes.' });
  }
  if (!db.isPremium(req.space)) await db.setPlan(req.space.id, 'premium', req.body?.period); // the webhook may have got here first
  res.json({ redirect: `/f/${req.space.key}${req.body?.reason === 'child' ? '/kids' : ''}?upgraded=1` });
}));

// Back to Free. A Razorpay subscription is cancelled there first, so no further charges are made. No data is removed.
app.post('/f/:key/downgrade', withSpace, wrap(async (req, res) => {
  const subscriptionId = req.space.razorpay_subscription_id;
  if (pay.enabled() && subscriptionId && db.isPremium(req.space)) {
    try { await pay.cancelSubscription(subscriptionId); } catch (e) {
      console.error(e);
      return res.redirect(303, `/f/${req.space.key}/upgrade?cancelfailed=1`);
    }
  }
  await db.setPlan(req.space.id, 'free');
  res.redirect(303, `/f/${req.space.key}/upgrade`);
}));

// Sends a Free family to the checkout when they open or change a record older than 90 days.
const unlessLocked = (handler) => wrap(async (req, res, next) => {
  const entry = await db.getEntry(req.space.id, req.params.id);
  if (entry && db.isLocked(req.space, entry)) return res.redirect(303, upgradeUrl(req.space, 'history'));
  return handler(req, res, next);
});

app.get('/f/:key/stamp', withSpace, wrap(async (req, res) => res.type('text').send(await db.stamp(req.space.id))));

app.get('/f/:key/connect', withSpace, wrap(async (req, res) =>
  res.send(views.connect({ space: req.space, mcpUrl: oauth.mcpUrl(baseUrl(req)), connection: await db.oauthConnection(req.user.id), disconnected: req.query.disconnected === '1' }))));

// Signs this parent's Claude out of KidLog. Other parents' connections are not touched.
app.post('/f/:key/connect/disconnect', withSpace, wrap(async (req, res) => {
  await db.oauthDisconnect(req.user.id);
  res.redirect(303, `/f/${req.space.key}/connect?disconnected=1`);
}));

// ---- Parents: who can open this family, and the invite link ----
app.get('/f/:key/parents', withSpace, wrap(async (req, res) => {
  const [members, invite] = await Promise.all([db.listMembers(req.space.id), db.currentInvite(req.space.id)]);
  res.send(views.parents({ space: req.space, members, invite, base: baseUrl(req), me: req.user, isOwner: req.isOwner }));
}));

app.post('/f/:key/parents/invite', withSpace, wrap(async (req, res) => {
  await db.createInvite(req.space.id);
  res.redirect(303, `/f/${req.space.key}/parents`);
}));

app.post('/f/:key/parents/invite/delete', withSpace, wrap(async (req, res) => {
  await db.cancelInvites(req.space.id);
  res.redirect(303, `/f/${req.space.key}/parents`);
}));

// The parent who created the family can remove anyone else; an invited parent can only remove themselves.
app.post('/f/:key/parents/:id/remove', withSpace, wrap(async (req, res) => {
  const self = String(req.user.id) === req.params.id;
  if (req.isOwner || self) await db.removeMember(req.space.id, req.params.id);
  res.redirect(303, self && !req.isOwner ? '/' : `/f/${req.space.key}/parents`);
}));

// ---- Share with doctor ----
const sharePage = async (req, extra = {}) => views.share({
  space: req.space, base: baseUrl(req),
  children: await db.listChildren(req.space.id), shares: await db.listShares(req.space.id),
  preselect: db.clean(req.query.child, 60), ...extra,
});

app.get('/f/:key/share', withSpace, wrap(async (req, res) => res.send(await sharePage(req, { fresh: req.query.new }))));

app.post('/f/:key/share', withSpace, wrap(async (req, res) => {
  const r = await db.createShare(req.space.id, { child: db.clean(req.body.child, 60), flaggedOnly: req.body.what === 'flagged' });
  if (r.error) return res.status(400).send(await sharePage(req, { error: r.error }));
  res.redirect(303, `/f/${req.space.key}/share?new=${r.value.id}`);
}));

app.post('/f/:key/share/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteShare(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}/share`);
}));

// Forms may only name a child who already has a profile, so that every child is added with a birth date.
const NEW_CHILD = 'Add this child on the Children page first, with their birth date.';
const unknownChild = async (spaceId, name) => !(await db.listChildren(spaceId)).some((c) => c.child.toLowerCase() === db.clean(name, 60).toLowerCase());

// ---- Appointments ----
const apptBody = (b) => ({ child: b.child, kind: b.kind, scheduled_at: b.scheduled_at, title: b.title, notes: b.notes ?? '' });

app.get('/f/:key/appointments', withSpace, wrap(async (req, res) => {
  const child = db.clean(req.query.child, 60);
  const [list, children] = await Promise.all([db.listAppointments(req.space.id, { child }), db.listChildren(req.space.id)]);
  res.send(views.appointments({ space: req.space, list, children, child, now: localNow(req) }));
}));

app.get('/f/:key/appointments/new', withSpace, wrap(async (req, res) => {
  const children = await db.listChildren(req.space.id);
  if (!children.length) return res.redirect(303, `/f/${req.space.key}/kids?first=1`);
  const picked = children.find((c) => c.child.toLowerCase() === db.clean(req.query.child, 60).toLowerCase());
  const appt = { child: picked ? picked.child : children.length === 1 ? children[0].child : '', kind: 'doctor', scheduled_at: '', title: '', notes: '' };
  res.send(views.appointmentForm({ space: req.space, appt, isNew: true, children }));
}));

app.post('/f/:key/appointments', withSpace, wrap(async (req, res) => {
  const body = apptBody(req.body);
  let v = db.validateAppointment(body);
  if (!v.error && await unknownChild(req.space.id, body.child)) v = { error: NEW_CHILD };
  if (v.error) {
    return res.status(400).send(views.appointmentForm({
      space: req.space, appt: { ...body, scheduled_at: db.normaliseWhen(body.scheduled_at) || '' }, error: v.error, isNew: true,
      children: await db.listChildren(req.space.id),
    }));
  }
  const a = await db.addAppointment(req.space.id, v.value, 'manual');
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(a.child)}`);
}));

app.get('/f/:key/appointments/:id', withSpace, wrap(async (req, res) => {
  const appt = await db.getAppointment(req.space.id, req.params.id);
  if (!appt) return res.status(404).send(views.notFound('That appointment no longer exists.'));
  res.send(views.appointmentForm({ space: req.space, appt, isNew: false, children: await db.listChildren(req.space.id) }));
}));

app.post('/f/:key/appointments/:id', withSpace, wrap(async (req, res) => {
  const existing = await db.getAppointment(req.space.id, req.params.id);
  if (!existing) return res.status(404).send(views.notFound('That appointment no longer exists.'));
  const body = apptBody(req.body);
  let v = db.validateAppointment(body);
  if (!v.error && await unknownChild(req.space.id, body.child)) v = { error: NEW_CHILD };
  if (v.error) {
    return res.status(400).send(views.appointmentForm({
      space: req.space, appt: { ...existing, ...body, scheduled_at: db.normaliseWhen(body.scheduled_at) || existing.scheduled_at },
      error: v.error, isNew: false, children: await db.listChildren(req.space.id),
    }));
  }
  await db.updateAppointment(req.space.id, existing.id, v.value);
  res.redirect(303, `/f/${req.space.key}/appointments`);
}));

app.post('/f/:key/appointments/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteAppointment(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}/appointments`);
}));

// ---- Child profiles ----
app.get('/f/:key/kids', withSpace, wrap(async (req, res) =>
  res.send(views.kids({ space: req.space, children: await db.listChildren(req.space.id), first: req.query.first === '1', upgraded: req.query.upgraded === '1' }))));

app.post('/f/:key/kids', withSpace, wrap(async (req, res) => {
  const dob = db.requireDob(req.body.dob);
  const r = dob.error ? dob : await db.saveChild(req.space.id, { name: req.body.name, dob: dob.value });
  if (r.error) return res.status(400).send(views.kids({ space: req.space, children: await db.listChildren(req.space.id), error: r.error, draft: req.body }));
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(r.value)}`);
}));

// ---- Vaccines: a published schedule next to what has been given ----
const withChild = wrap(async (req, res, next) => {
  const child = await db.getChild(req.space.id, req.params.id);
  if (!child) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  req.child = child;
  next();
});
const vaccinesUrl = (req, extra = '') => `/f/${req.space.key}/vaccines/${req.child.id}${extra}`;

app.get('/f/:key/vaccines', withSpace, wrap(async (req, res) => {
  const children = await db.listChildren(req.space.id);
  res.redirect(303, children.length ? `/f/${req.space.key}/vaccines/${children[0].id}` : `/f/${req.space.key}/kids?first=1`);
}));

const vaccinesPage = async (req, extra = {}) => {
  const c = req.child;
  const today = localNow(req).slice(0, 10);
  const visits = c.dob && SCHEDULES[c.vaccine_schedule] ? childSchedule(c.vaccine_schedule, c.dob, await db.givenDoses(c.id, c.vaccine_schedule), today) : null;
  return views.vaccines({
    space: req.space, child: c, children: await db.listChildren(req.space.id), visits, today, user: req.user,
    emailReady: mail.enabled(), changing: req.query.change === '1', ...extra,
  });
};

app.get('/f/:key/vaccines/:id', withSpace, withChild, wrap(async (req, res) => res.send(await vaccinesPage(req, { saved: req.query.saved === '1' }))));

app.post('/f/:key/vaccines/:id/schedule', withSpace, withChild, wrap(async (req, res) => {
  if (!SCHEDULE_IDS.includes(req.body.schedule)) return res.status(400).send(await vaccinesPage(req, { error: 'Choose one of the two schedules.' }));
  await db.setVaccineSchedule(req.space.id, req.child.id, req.body.schedule);
  res.redirect(303, vaccinesUrl(req));
}));

app.post('/f/:key/vaccines/:id/given', withSpace, withChild, wrap(async (req, res) => {
  const r = await recordDoses({ space: req.space, child: req.child, doseIds: req.body.doses ?? [], givenOn: db.clean(req.body.given_on, 10), source: 'manual', localNow: localNow(req) });
  if (r.error) return res.status(400).send(await vaccinesPage(req, { error: r.error }));
  res.redirect(303, vaccinesUrl(req, '?saved=1'));
}));

app.post('/f/:key/vaccines/:id/undo', withSpace, withChild, wrap(async (req, res) => {
  if (req.child.vaccine_schedule) await db.unmarkDose(req.child.id, req.child.vaccine_schedule, req.body.dose);
  res.redirect(303, vaccinesUrl(req));
}));

// Email reminders are each parent's own choice.
app.post('/f/:key/vaccines/:id/emails', withSpace, withChild, wrap(async (req, res) => {
  await db.setVaccineEmails(req.user.id, req.body.on === '1');
  res.redirect(303, vaccinesUrl(req));
}));

// A calendar file of the visits still to come, for the parent's own phone or computer calendar.
app.get('/f/:key/vaccines/:id/calendar.ics', withSpace, withChild, wrap(async (req, res) => {
  const c = req.child;
  if (!c.dob || !SCHEDULES[c.vaccine_schedule]) return res.redirect(303, vaccinesUrl(req));
  const today = localNow(req).slice(0, 10);
  const visits = childSchedule(c.vaccine_schedule, c.dob, await db.givenDoses(c.id, c.vaccine_schedule), today);
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="kidlog-vaccines-${c.id}.ics"`);
  res.send(calendarFile({ child: c, scheduleId: c.vaccine_schedule, visits, today, url: `${baseUrl(req)}${vaccinesUrl(req)}` }));
}));

app.get('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  res.send(views.kidForm({ space: req.space, kid }));
}));

app.post('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  const dob = db.requireDob(req.body.dob);
  const r = dob.error ? dob : await db.saveChild(req.space.id, { id: kid.id, name: req.body.name, dob: dob.value });
  if (r.error) return res.status(400).send(views.kidForm({ space: req.space, kid: { ...kid, child: req.body.name ?? kid.child, dob: req.body.dob ?? kid.dob }, error: r.error }));
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(r.value)}`);
}));

app.post('/f/:key/kids/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteChild(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}/kids`);
}));

app.get('/f/:key/new', withSpace, wrap(async (req, res) => {
  const children = await db.listChildren(req.space.id);
  if (!children.length) return res.redirect(303, `/f/${req.space.key}/kids?first=1`);
  const picked = children.find((c) => c.child.toLowerCase() === db.clean(req.query.child, 60).toLowerCase());
  const entry = { child: picked ? picked.child : children.length === 1 ? children[0].child : '', occurred_at: '', category: 'symptom', title: '', details: '', temperature: '', flagged: false };
  res.send(views.entryForm({ space: req.space, entry, isNew: true, children }));
}));

app.post('/f/:key/entries', withSpace, wrap(async (req, res) => {
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  let v = db.validateEntry(body);
  if (!v.error && await unknownChild(req.space.id, body.child)) v = { error: NEW_CHILD };
  if (v.error) {
    const children = await db.listChildren(req.space.id);
    return res.status(400).send(views.entryForm({ space: req.space, entry: { ...body, occurred_at: db.normaliseWhen(body.occurred_at) || '' }, error: v.error, isNew: true, children }));
  }
  const saved = await db.addEntry(req.space.id, v.value, 'manual');
  // Saved, but dated before the Free plan's 90 days: say so instead of letting it silently disappear.
  if (db.isLocked(req.space, saved)) return res.redirect(303, upgradeUrl(req.space, 'saved'));
  res.redirect(303, `/f/${req.space.key}`);
}));

app.get('/f/:key/e/:id', withSpace, unlessLocked(async (req, res) => {
  const entry = await db.getEntry(req.space.id, req.params.id);
  if (!entry) return res.status(404).send(views.notFound('That entry no longer exists.'));
  res.send(views.entryForm({ space: req.space, entry, isNew: false, children: await db.listChildren(req.space.id) }));
}));

app.post('/f/:key/e/:id', withSpace, unlessLocked(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (!existing) return res.status(404).send(views.notFound('That entry no longer exists.'));
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  let v = db.validateEntry(body);
  if (!v.error && await unknownChild(req.space.id, body.child)) v = { error: NEW_CHILD };
  if (v.error) {
    return res.status(400).send(views.entryForm({
      space: req.space, entry: { ...existing, ...body, occurred_at: db.normaliseWhen(body.occurred_at) || existing.occurred_at },
      error: v.error, isNew: false, children: await db.listChildren(req.space.id),
    }));
  }
  await db.updateEntry(req.space.id, existing.id, v.value, { markEdited: true });
  res.redirect(303, `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/flag', withSpace, unlessLocked(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (existing) await db.updateEntry(req.space.id, existing.id, { flagged: !existing.flagged });
  res.redirect(303, req.get('referer')?.startsWith(baseUrl(req)) ? req.get('referer') : `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/delete', withSpace, unlessLocked(async (req, res) => {
  await db.deleteEntry(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}`);
}));

// ---- Read-only doctor view ----
app.get('/d/:token', wrap(async (req, res) => {
  const share = await db.resolveShare(req.params.token);
  if (!share) return res.status(404).send(views.notFound('This share link is not valid or has been turned off.'));
  const lock = { child: share.child, flaggedOnly: share.flaggedOnly };
  res.send(views.doctorView({ space: share.space, token: req.params.token, lock, ...(await boardData(share.space, req.query, lock)) }));
}));

app.use((req, res) => res.status(404).send(views.notFound()));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // A second child on the Free plan, from any form: open the checkout instead of an error page.
  if (err?.code === 'child_limit' && req.space) return res.redirect(303, upgradeUrl(req.space, 'child'));
  console.error(err);
  res.status(500).send(views.notFound('Something went wrong on our side. Please try again.'));
});

export default app;
