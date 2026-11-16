// KidLog web app + Claude connection in one Express app.
import express from 'express';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import * as views from './views.js';
import { handleMcp } from './mcp.js';
import * as auth from './auth.js';
import * as oauth from './oauth.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
// Logo and icons. On Vercel the public/ folder is served by the platform itself; this line covers other hosts.
app.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { maxAge: '1d', index: false }));
app.use(express.json({ limit: '200kb' }));
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
async function boardData(spaceId, query, lock = {}) {
  const child = lock.child || db.clean(query.child, 60);
  const flagged = lock.flaggedOnly || query.flagged === '1';
  const range = RANGE_DAYS[query.range] ? String(query.range) : 'all';
  let [all, children] = await Promise.all([db.listEntries(spaceId, { child }), db.listChildren(spaceId)]);
  if (lock.child) children = children.filter((c) => c.child.toLowerCase() === lock.child.toLowerCase());
  if (lock.flaggedOnly) all = all.filter((e) => e.flagged);
  let entries = all;
  if (range !== 'all') {
    // One spare day so "today" in any timezone is always included.
    const cutoff = new Date(Date.now() - (RANGE_DAYS[range] + 1) * 86400000).toISOString().slice(0, 16);
    entries = entries.filter((e) => e.occurred_at >= cutoff);
  }
  if (flagged) entries = entries.filter((e) => e.flagged);
  return { all, entries, children, child, flagged, range };
}

app.get('/healthz', wrap(async (req, res) => { await db.init(); res.send('ok'); }));

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
  const [data, stamp] = await Promise.all([boardData(req.space.id, req.query), db.stamp(req.space.id)]);
  const now = localNow(req);
  const upcoming = await db.listAppointments(req.space.id, { child: data.child, from: now });
  res.send(views.timeline({ space: req.space, ...data, upcoming, now, stamp, welcome: req.query.welcome === '1' }));
}));

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

// ---- Appointments ----
const apptBody = (b) => ({ child: b.child, kind: b.kind, scheduled_at: b.scheduled_at, title: b.title, notes: b.notes ?? '' });

app.get('/f/:key/appointments', withSpace, wrap(async (req, res) => {
  const child = db.clean(req.query.child, 60);
  const [list, children] = await Promise.all([db.listAppointments(req.space.id, { child }), db.listChildren(req.space.id)]);
  res.send(views.appointments({ space: req.space, list, children, child, now: localNow(req) }));
}));

app.get('/f/:key/appointments/new', withSpace, wrap(async (req, res) => {
  const children = await db.listChildren(req.space.id);
  const picked = children.find((c) => c.child.toLowerCase() === db.clean(req.query.child, 60).toLowerCase());
  const appt = { child: picked ? picked.child : children.length === 1 ? children[0].child : '', kind: 'doctor', scheduled_at: '', title: '', notes: '' };
  res.send(views.appointmentForm({ space: req.space, appt, isNew: true, children }));
}));

app.post('/f/:key/appointments', withSpace, wrap(async (req, res) => {
  const body = apptBody(req.body);
  const v = db.validateAppointment(body);
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
  const v = db.validateAppointment(body);
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
  res.send(views.kids({ space: req.space, children: await db.listChildren(req.space.id) }))));

app.post('/f/:key/kids', withSpace, wrap(async (req, res) => {
  const dob = db.validateDob(req.body.dob);
  const r = dob.error ? dob : await db.saveChild(req.space.id, { name: req.body.name, dob: dob.value ?? undefined });
  if (r.error) return res.status(400).send(views.kids({ space: req.space, children: await db.listChildren(req.space.id), error: r.error, draft: req.body }));
  res.redirect(303, `/f/${req.space.key}?child=${encodeURIComponent(r.value)}`);
}));

app.get('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  res.send(views.kidForm({ space: req.space, kid }));
}));

app.post('/f/:key/kids/:id', withSpace, wrap(async (req, res) => {
  const kid = (await db.listChildren(req.space.id)).find((c) => String(c.id) === req.params.id);
  if (!kid) return res.status(404).send(views.notFound('That child profile no longer exists.'));
  const dob = db.validateDob(req.body.dob);
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
  const picked = children.find((c) => c.child.toLowerCase() === db.clean(req.query.child, 60).toLowerCase());
  const entry = { child: picked ? picked.child : children.length === 1 ? children[0].child : '', occurred_at: '', category: 'symptom', title: '', details: '', temperature: '', flagged: false };
  res.send(views.entryForm({ space: req.space, entry, isNew: true, children }));
}));

app.post('/f/:key/entries', withSpace, wrap(async (req, res) => {
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  const v = db.validateEntry(body);
  if (v.error) {
    const children = await db.listChildren(req.space.id);
    return res.status(400).send(views.entryForm({ space: req.space, entry: { ...body, occurred_at: db.normaliseWhen(body.occurred_at) || '' }, error: v.error, isNew: true, children }));
  }
  await db.addEntry(req.space.id, v.value, 'manual');
  res.redirect(303, `/f/${req.space.key}`);
}));

app.get('/f/:key/e/:id', withSpace, wrap(async (req, res) => {
  const entry = await db.getEntry(req.space.id, req.params.id);
  if (!entry) return res.status(404).send(views.notFound('That entry no longer exists.'));
  res.send(views.entryForm({ space: req.space, entry, isNew: false, children: await db.listChildren(req.space.id) }));
}));

app.post('/f/:key/e/:id', withSpace, wrap(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (!existing) return res.status(404).send(views.notFound('That entry no longer exists.'));
  const body = { ...req.body, details: req.body.details ?? '', temperature: req.body.temperature ?? '', flagged: req.body.flagged === 'on' };
  const v = db.validateEntry(body);
  if (v.error) {
    return res.status(400).send(views.entryForm({
      space: req.space, entry: { ...existing, ...body, occurred_at: db.normaliseWhen(body.occurred_at) || existing.occurred_at },
      error: v.error, isNew: false, children: await db.listChildren(req.space.id),
    }));
  }
  await db.updateEntry(req.space.id, existing.id, v.value, { markEdited: true });
  res.redirect(303, `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/flag', withSpace, wrap(async (req, res) => {
  const existing = await db.getEntry(req.space.id, req.params.id);
  if (existing) await db.updateEntry(req.space.id, existing.id, { flagged: !existing.flagged });
  res.redirect(303, req.get('referer')?.startsWith(baseUrl(req)) ? req.get('referer') : `/f/${req.space.key}`);
}));

app.post('/f/:key/e/:id/delete', withSpace, wrap(async (req, res) => {
  await db.deleteEntry(req.space.id, req.params.id);
  res.redirect(303, `/f/${req.space.key}`);
}));

// ---- Read-only doctor view ----
app.get('/d/:token', wrap(async (req, res) => {
  const share = await db.resolveShare(req.params.token);
  if (!share) return res.status(404).send(views.notFound('This share link is not valid or has been turned off.'));
  const lock = { child: share.child, flaggedOnly: share.flaggedOnly };
  res.send(views.doctorView({ space: share.space, token: req.params.token, lock, ...(await boardData(share.space.id, req.query, lock)) }));
}));

app.use((req, res) => res.status(404).send(views.notFound()));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).send(views.notFound('Something went wrong on our side. Please try again.'));
});

export default app;
