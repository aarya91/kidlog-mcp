// What happens around the vaccine schedule: recording doses as given, and the daily reminder emails.
import * as db from './db.js';
import * as mail from './mail.js';
import { SCHEDULES, DISCLAIMER, childSchedule, daysBetween } from './vaccines.js';

// Today's date where the parents are. Reminder emails and Claude's tools have no browser to ask.
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.REMINDER_TZ || 'Asia/Kolkata' }).format(new Date());
const nice = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Marks doses as given and, when the date is known, adds one vaccine entry to the timeline.
// Returns { names } of the doses newly recorded, or { error }.
export async function recordDoses({ space, child, doseIds, givenOn, source, localNow }) {
  const s = SCHEDULES[child.vaccine_schedule];
  if (!s) return { error: 'Choose a vaccine schedule for this child first.' };
  const known = new Map(s.visits.flatMap((v) => v.doses.map((d) => [d.id, d.name])));
  const ids = [...new Set([doseIds].flat().filter((id) => known.has(id)))];
  if (!ids.length) return { error: 'Choose at least one vaccine.' };
  const day = localNow.slice(0, 10);
  if (givenOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(givenOn) || Number.isNaN(Date.parse(givenOn))) return { error: 'The date must look like 2026-11-10.' };
    if (givenOn > day) return { error: 'The date cannot be in the future.' };
    if (child.dob && givenOn < child.dob) return { error: 'The date cannot be before the birth date.' };
  }
  const already = await db.givenDoses(child.id, child.vaccine_schedule);
  await db.markDoses(child.id, child.vaccine_schedule, ids, givenOn);
  const fresh = ids.filter((id) => !Object.hasOwn(already, id));
  const names = fresh.map((id) => known.get(id));
  if (givenOn && names.length) {
    const title = `Vaccines given: ${names.join('; ')}`;
    await db.addEntry(space.id, {
      child: child.child, category: 'vaccine', flagged: false,
      occurred_at: `${givenOn}T${givenOn === day ? localNow.slice(11, 16) : '09:00'}`,
      title: title.length <= 120 ? title : `${names.length} vaccines given`,
      details: names.map((n) => `- ${n}`).join('\n'),
    }, source);
  }
  return { names: ids.map((id) => known.get(id)) };
}

// Daily job: one email a week before a visit is due and one on the day, to each parent who asked for them.
// A window of a few days means a skipped run does not lose a reminder; each reminder is still sent only once.
const KINDS = [
  { kind: 'week', from: 5, to: 7, when: (v) => `are due on ${nice(v.from)}` },
  { kind: 'day', from: -2, to: 0, when: (v) => `are due now (from ${nice(v.from)})` },
];

export async function sendReminders(baseUrl) {
  const out = { sent: 0, failed: 0 };
  if (!mail.enabled()) return { ...out, skipped: 'Email is not set up.' };
  const day = today();
  const visitsOf = new Map(); // child id -> visits, worked out once per child
  for (const t of await db.reminderTargets()) {
    if (!visitsOf.has(t.child_id)) visitsOf.set(t.child_id, childSchedule(t.schedule, t.dob, await db.givenDoses(t.child_id, t.schedule), day));
    for (const v of visitsOf.get(t.child_id)) {
      if (!v.pending.length) continue;
      const away = daysBetween(day, v.from);
      const k = KINDS.find((x) => away >= x.from && away <= x.to);
      if (!k || !(await db.claimReminder(t, v.id, k.kind))) continue;
      const url = `${baseUrl}/f/${t.space_key}/vaccines/${t.child_id}`;
      const list = v.pending.map((d) => `${d.name}${d.note ? ` (${d.note})` : ''}`);
      const lead = `${t.child}'s ${v.label.toLowerCase()} vaccines ${k.when(v)}${v.until ? `, any time until ${nice(v.until)}` : ''}.`;
      const foot = `Mark them as given, or turn these emails off, at ${url}`;
      try {
        await mail.send({
          to: t.email,
          subject: `${t.child}: vaccines ${k.kind === 'week' ? 'due in a week' : 'due now'} (${v.label})`,
          text: `${lead}\n\n${SCHEDULES[t.schedule].name}:\n${list.map((x) => `- ${x}`).join('\n')}\n\n${DISCLAIMER}\n\n${foot}`,
          html: `<p>${esc(lead)}</p><p><b>${esc(SCHEDULES[t.schedule].name)}</b></p><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p>${esc(DISCLAIMER)}</p><p>Mark them as given, or turn these emails off, on <a href="${esc(url)}">${esc(t.child)}'s vaccines page</a>.</p>`,
        });
        out.sent += 1;
      } catch (e) {
        console.error(e);
        await db.releaseReminder(t, v.id, k.kind);
        out.failed += 1;
      }
    }
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
