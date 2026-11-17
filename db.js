// Plain Postgres storage. No AI anywhere in this app.
import pg from 'pg';
import crypto from 'node:crypto';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) console.warn('DATABASE_URL is not set. Set it to a Postgres connection string.');

const isLocal = /localhost|127\.0\.0\.1/.test(url || '');
export const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,
});

export const CATEGORIES = ['symptom', 'temperature', 'medicine', 'feeding', 'sleep', 'doctor_visit', 'vaccine', 'note'];

let ready;
export function init() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        share_token TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        google_sub TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE spaces ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id);
      CREATE UNIQUE INDEX IF NOT EXISTS spaces_owner_idx ON spaces(owner_id) WHERE owner_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS space_members (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      INSERT INTO space_members (user_id, space_id)
        SELECT owner_id, id FROM spaces WHERE owner_id IS NOT NULL
        ON CONFLICT (user_id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS invites (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY,
        info JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS oauth_grants (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        client_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redirect_uri TEXT,
        code_challenge TEXT,
        state TEXT,
        resource TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS oauth_grants_user_idx ON oauth_grants(user_id, kind);
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        child TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        temperature TEXT,
        flagged BOOLEAN NOT NULL DEFAULT false,
        source TEXT NOT NULL DEFAULT 'manual',
        edited BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS entries_space_idx ON entries(space_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS children (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        dob TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS children_name_idx ON children(space_id, lower(name));
      ALTER TABLE children ADD COLUMN IF NOT EXISTS vaccine_schedule TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS vaccine_emails BOOLEAN NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS vaccine_doses (
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        schedule TEXT NOT NULL,
        dose_id TEXT NOT NULL,
        given_on TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (child_id, schedule, dose_id)
      );
      CREATE TABLE IF NOT EXISTS vaccine_reminders (
        child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        schedule TEXT NOT NULL,
        visit_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (child_id, schedule, visit_id, kind, user_id)
      );
      INSERT INTO children (space_id, name)
        SELECT space_id, min(child) FROM entries GROUP BY space_id, lower(child)
        ON CONFLICT (space_id, lower(name)) DO NOTHING;
      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        child TEXT,
        flagged_only BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        child TEXT NOT NULL,
        kind TEXT NOT NULL,
        scheduled_at TEXT NOT NULL,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS appointments_space_idx ON appointments(space_id, scheduled_at);
    `).catch((e) => { ready = undefined; throw e; });
  }
  return ready;
}

const token = (n) => crypto.randomBytes(n).toString('base64url');

// One family per account. Returns the existing family if this account already belongs to one.
export async function createSpace(name, ownerId) {
  await init();
  const mine = await spaceByUser(ownerId);
  if (mine) return mine;
  const r = await pool.query(
    `INSERT INTO spaces (key, share_token, name, owner_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_id) WHERE owner_id IS NOT NULL DO NOTHING RETURNING *`,
    [token(18), token(18), clean(name, 80) || 'Our family', ownerId]
  );
  if (r.rows[0]) await addMember(r.rows[0].id, ownerId);
  return r.rows[0] || spaceByUser(ownerId);
}

// ---- Accounts and login sessions ----
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

export async function upsertUser({ sub, email, name }) {
  await init();
  const r = await pool.query(
    `INSERT INTO users (google_sub, email, name) VALUES ($1, $2, $3)
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, email, name`,
    [String(sub), clean(email, 200), clean(name, 120)]
  );
  return r.rows[0];
}

// Only a hash of the session token is stored, so a database leak does not sign anyone in.
export async function createSession(userId, days) {
  const t = token(32);
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [hash(t), userId, days]);
  return t;
}

export async function userBySession(t) {
  await init();
  const r = await pool.query(
    'SELECT u.id, u.email, u.name, u.vaccine_emails FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
    [hash(t)]
  );
  return r.rows[0];
}

export async function deleteSession(t) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash(t)]);
}

// The family this account belongs to, whether they created it or were invited.
export async function spaceByUser(userId) {
  await init();
  const r = await pool.query('SELECT s.* FROM space_members m JOIN spaces s ON s.id = m.space_id WHERE m.user_id = $1', [userId]);
  return r.rows[0];
}

// Attaches a timeline made before sign-in existed to an account. Only works while it has no owner.
export async function claimSpace(key, userId) {
  const r = await pool.query('UPDATE spaces SET owner_id = $1 WHERE key = $2 AND owner_id IS NULL RETURNING *', [userId, String(key)]);
  if (r.rows[0]) await addMember(r.rows[0].id, userId);
  return r.rows[0];
}

// ---- Parents: everyone who can open a family's timeline ----
async function addMember(spaceId, userId) {
  const r = await pool.query('INSERT INTO space_members (user_id, space_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, spaceId]);
  return r.rowCount === 1;
}

export async function isMember(spaceId, userId) {
  const r = await pool.query('SELECT 1 FROM space_members WHERE space_id = $1 AND user_id = $2', [spaceId, userId]);
  return r.rowCount === 1;
}

// The parent who created the family comes first.
export async function listMembers(spaceId) {
  const r = await pool.query(
    `SELECT u.id, u.name, u.email, m.joined_at, (u.id = s.owner_id) AS owner
     FROM space_members m JOIN users u ON u.id = m.user_id JOIN spaces s ON s.id = m.space_id
     WHERE m.space_id = $1 ORDER BY (u.id = s.owner_id) DESC, m.joined_at`,
    [spaceId]
  );
  return r.rows;
}

// The parent who created the family can never be removed.
export async function removeMember(spaceId, userId) {
  const n = Number(userId);
  if (!Number.isInteger(n)) return;
  await pool.query(
    'DELETE FROM space_members m USING spaces s WHERE s.id = m.space_id AND m.space_id = $1 AND m.user_id = $2 AND s.owner_id <> m.user_id',
    [spaceId, n]
  );
}

// ---- Invite links for another parent: one at a time, single use, valid for 7 days ----
export const INVITE_DAYS = 7;

export async function currentInvite(spaceId) {
  const r = await pool.query('SELECT * FROM invites WHERE space_id = $1 AND expires_at > now() ORDER BY id DESC LIMIT 1', [spaceId]);
  return r.rows[0];
}

export async function createInvite(spaceId) {
  await pool.query('DELETE FROM invites WHERE expires_at <= now()');
  const existing = await currentInvite(spaceId);
  if (existing) return existing;
  const r = await pool.query(
    'INSERT INTO invites (space_id, token, expires_at) VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING *',
    [spaceId, token(18), INVITE_DAYS]
  );
  return r.rows[0];
}

export async function cancelInvites(spaceId) {
  await pool.query('DELETE FROM invites WHERE space_id = $1', [spaceId]);
}

// Returns { space } for an invite that can still be used, or undefined.
export async function inviteByToken(t) {
  await init();
  const r = await pool.query('SELECT s.* FROM invites i JOIN spaces s ON s.id = i.space_id WHERE i.token = $1 AND i.expires_at > now()', [String(t)]);
  return r.rows[0] ? { space: r.rows[0] } : undefined;
}

// Uses up the invite and adds the account to the family. Returns the family, or undefined if the
// invite is no longer valid or the account already belongs to a family.
export async function acceptInvite(t, userId) {
  if (await spaceByUser(userId)) return undefined;
  const r = await pool.query('DELETE FROM invites WHERE token = $1 AND expires_at > now() RETURNING space_id', [String(t)]);
  if (!r.rows[0]) return undefined;
  await addMember(r.rows[0].space_id, userId);
  return spaceByUser(userId);
}

// ---- Claude connector sign-in (OAuth) ----
// Apps that have registered to connect (Claude registers itself automatically).
export async function oauthGetClient(id) {
  await init();
  const r = await pool.query('SELECT info FROM oauth_clients WHERE client_id = $1', [String(id)]);
  return r.rows[0]?.info;
}

export async function oauthSaveClient(client) {
  await init();
  // Registrations that were never used to connect anyone are cleared out after a month.
  await pool.query(`DELETE FROM oauth_clients c WHERE c.created_at < now() - interval '30 days'
                    AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id = c.client_id)`);
  await pool.query('INSERT INTO oauth_clients (client_id, info) VALUES ($1, $2)', [client.client_id, JSON.stringify(client)]);
  return client;
}

// One table holds every short-lived secret of the connection: the approval page in progress ('pending'),
// the one-time code ('code'), and the access and refresh tokens. Only hashes are stored.
export async function oauthCreateGrant({ kind, clientId, userId, redirectUri = null, codeChallenge = null, state = null, resource = null, seconds }) {
  await init();
  const t = token(32);
  await pool.query('DELETE FROM oauth_grants WHERE expires_at < now()');
  await pool.query(
    `INSERT INTO oauth_grants (token_hash, kind, client_id, user_id, redirect_uri, code_challenge, state, resource, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(secs => $9))`,
    [hash(t), kind, clientId, userId, redirectUri, codeChallenge, state, resource, seconds]
  );
  return t;
}

export async function oauthGetGrant(t, kind) {
  await init();
  const r = await pool.query('SELECT * FROM oauth_grants WHERE token_hash = $1 AND kind = $2 AND expires_at > now()', [hash(t), kind]);
  return r.rows[0];
}

// Reads and removes in one step, so an approval page or a code can be used only once.
export async function oauthTakeGrant(t, kind) {
  await init();
  const r = await pool.query('DELETE FROM oauth_grants WHERE token_hash = $1 AND kind = $2 AND expires_at > now() RETURNING *', [hash(t), kind]);
  return r.rows[0];
}

export async function oauthExpireSoon(t, seconds) {
  await pool.query('UPDATE oauth_grants SET expires_at = least(expires_at, now() + make_interval(secs => $2)) WHERE token_hash = $1', [hash(t), seconds]);
}

export async function oauthDeleteGrant(t, clientId) {
  await init();
  await pool.query('DELETE FROM oauth_grants WHERE token_hash = $1 AND client_id = $2', [hash(t), clientId]);
}

// Whether this parent has a live Claude connection, and since when.
export async function oauthConnection(userId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n, min(created_at) AS since FROM oauth_grants
     WHERE user_id = $1 AND kind = 'refresh' AND expires_at > now() + interval '5 minutes'`,
    [userId]
  );
  return r.rows[0].n ? { since: r.rows[0].since } : null;
}

// Signs this parent's Claude out of KidLog straight away.
export async function oauthDisconnect(userId) {
  await pool.query('DELETE FROM oauth_grants WHERE user_id = $1', [userId]);
}

export async function spaceByKey(key) {
  await init();
  const r = await pool.query('SELECT * FROM spaces WHERE key = $1', [String(key)]);
  return r.rows[0];
}

export async function spaceByShareToken(t) {
  await init();
  const r = await pool.query('SELECT * FROM spaces WHERE share_token = $1', [String(t)]);
  return r.rows[0];
}

export function clean(v, max) {
  return String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

// Accepts "YYYY-MM-DDTHH:MM" (or with a space, or date only). Stored as local text, no timezone maths.
export function normaliseWhen(v) {
  const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00'] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}`;
}

// Validates and tidies entry fields. Returns { value } or { error }.
export function validateEntry(input, { partial = false } = {}) {
  const out = {};
  const has = (k) => input[k] !== undefined && input[k] !== null;
  if (has('child') || !partial) {
    out.child = clean(input.child, 60);
    if (!out.child) return { error: "The child's name is required." };
  }
  if (has('occurred_at') || !partial) {
    out.occurred_at = normaliseWhen(input.occurred_at);
    if (!out.occurred_at) return { error: 'The date and time must look like 2026-11-10T02:15.' };
  }
  if (has('category') || !partial) {
    out.category = clean(input.category, 30).toLowerCase();
    if (!CATEGORIES.includes(out.category)) return { error: `Category must be one of: ${CATEGORIES.join(', ')}.` };
  }
  if (has('title') || !partial) {
    out.title = clean(input.title, 120);
    if (!out.title) return { error: 'A short title is required.' };
  }
  if (has('details')) out.details = clean(input.details, 4000);
  if (has('temperature')) out.temperature = clean(input.temperature, 20) || null;
  if (has('flagged')) out.flagged = input.flagged === true || input.flagged === 'on' || input.flagged === 'true';
  return { value: out };
}

// Birth date as YYYY-MM-DD, not in the future. Returns { value } (null when blank) or { error }.
export function validateDob(v) {
  const t = String(v ?? '').trim();
  if (!t) return { value: null };
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCMonth() !== +m[2] - 1 || +m[1] < 1990) return { error: 'The birth date must look like 2024-08-15.' };
  if (d.getTime() > Date.now() + 86400000) return { error: 'The birth date cannot be in the future.' };
  return { value: t };
}

// The same check, for forms where the birth date must be filled in.
export function requireDob(v) {
  const r = validateDob(v);
  return !r.error && r.value === null ? { error: 'The birth date is required. It is used for age and for the vaccine schedule.' } : r;
}

// Finds the child's profile by name (any capitalisation), creating it if new. Returns the saved spelling.
async function canonicalChild(spaceId, child) {
  const r = await pool.query(
    `INSERT INTO children (space_id, name) VALUES ($1, $2)
     ON CONFLICT (space_id, lower(name)) DO UPDATE SET name = children.name RETURNING name`,
    [spaceId, child]
  );
  return r.rows[0].name;
}

export async function getChild(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT id, name AS child, dob, vaccine_schedule FROM children WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

// Create (no id) or update a child profile. Renaming also renames the child's entries.
// Renaming onto another child's name merges the two. dob === undefined leaves the birth date alone.
export async function saveChild(spaceId, { id, name, dob }) {
  name = clean(name, 60);
  if (!name) return { error: "The child's name is required." };
  if (id === undefined) {
    const saved = await canonicalChild(spaceId, name);
    if (dob !== undefined) await pool.query('UPDATE children SET dob = $1 WHERE space_id = $2 AND lower(name) = lower($3)', [dob, spaceId, saved]);
    return { value: saved };
  }
  const current = await getChild(spaceId, id);
  if (!current) return { error: 'That child profile no longer exists.' };
  const clash = await pool.query('SELECT id, dob FROM children WHERE space_id = $1 AND lower(name) = lower($2) AND id <> $3', [spaceId, name, current.id]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (clash.rows[0]) {
      const target = clash.rows[0];
      await client.query('UPDATE entries SET child = (SELECT name FROM children WHERE id = $1) WHERE space_id = $2 AND lower(child) = lower($3)', [target.id, spaceId, current.child]);
      for (const t of ['appointments', 'shares']) {
        await client.query(`UPDATE ${t} SET child = (SELECT name FROM children WHERE id = $1) WHERE space_id = $2 AND lower(child) = lower($3)`, [target.id, spaceId, current.child]);
      }
      const keepDob = dob || target.dob || current.dob;
      await client.query('UPDATE children SET dob = $1 WHERE id = $2', [keepDob, target.id]);
      // Keep the vaccine record of the child being merged in, wherever the other profile has no record of that dose.
      await client.query(
        `INSERT INTO vaccine_doses (child_id, schedule, dose_id, given_on)
         SELECT $1, schedule, dose_id, given_on FROM vaccine_doses WHERE child_id = $2 ON CONFLICT DO NOTHING`,
        [target.id, current.id]
      );
      await client.query('DELETE FROM children WHERE id = $1', [current.id]);
    } else {
      await client.query('UPDATE entries SET child = $1 WHERE space_id = $2 AND lower(child) = lower($3)', [name, spaceId, current.child]);
      for (const t of ['appointments', 'shares']) {
        await client.query(`UPDATE ${t} SET child = $1 WHERE space_id = $2 AND lower(child) = lower($3)`, [name, spaceId, current.child]);
      }
      await client.query('UPDATE children SET name = $1, dob = $2 WHERE id = $3', [name, dob !== undefined ? dob : current.dob, current.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { value: name };
}

// Only children with no entries and no appointments can be removed.
export async function deleteChild(spaceId, id) {
  const c = await getChild(spaceId, id);
  if (!c) return;
  const r = await pool.query(
    `DELETE FROM children WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM entries WHERE space_id = $2 AND lower(child) = lower($3))
       AND NOT EXISTS (SELECT 1 FROM appointments WHERE space_id = $2 AND lower(child) = lower($3))`,
    [c.id, spaceId, c.child]
  );
  if (r.rowCount) await pool.query('DELETE FROM shares WHERE space_id = $1 AND lower(child) = lower($2)', [spaceId, c.child]);
}

// ---- Doctor share links ----
// Each link is locked to one child (or all children) and to flagged entries only (or everything).
export async function createShare(spaceId, { child, flaggedOnly }) {
  let name = null;
  if (child) {
    const r = await pool.query('SELECT name FROM children WHERE space_id = $1 AND lower(name) = lower($2)', [spaceId, child]);
    if (!r.rows[0]) return { error: 'Choose a child from the list.' };
    name = r.rows[0].name;
  }
  // Reuse an existing link with the same scope instead of piling up duplicates.
  const dup = await pool.query(
    'SELECT * FROM shares WHERE space_id = $1 AND flagged_only = $2 AND coalesce(lower(child), \'\') = coalesce(lower($3), \'\')',
    [spaceId, !!flaggedOnly, name]
  );
  if (dup.rows[0]) return { value: dup.rows[0] };
  const r = await pool.query(
    'INSERT INTO shares (space_id, token, child, flagged_only) VALUES ($1, $2, $3, $4) RETURNING *',
    [spaceId, token(18), name, !!flaggedOnly]
  );
  return { value: r.rows[0] };
}

export async function listShares(spaceId) {
  const r = await pool.query('SELECT * FROM shares WHERE space_id = $1 ORDER BY id DESC', [spaceId]);
  return r.rows;
}

export async function deleteShare(spaceId, id) {
  const n = Number(id);
  if (Number.isInteger(n)) await pool.query('DELETE FROM shares WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

// Returns { space, child, flaggedOnly } for a share token, or undefined.
// The family's original link (spaces.share_token) still works and shows everything.
export async function resolveShare(t) {
  await init();
  const r = await pool.query(
    'SELECT s.*, sh.child AS share_child, sh.flagged_only AS share_flagged FROM shares sh JOIN spaces s ON s.id = sh.space_id WHERE sh.token = $1',
    [String(t)]
  );
  if (r.rows[0]) {
    const { share_child, share_flagged, ...space } = r.rows[0];
    return { space, child: share_child, flaggedOnly: share_flagged };
  }
  const space = await spaceByShareToken(t);
  return space ? { space, child: null, flaggedOnly: false } : undefined;
}

// ---- Upcoming appointments ----
export const APPOINTMENT_KINDS = ['doctor', 'vaccine'];

export function validateAppointment(input) {
  const out = {};
  out.child = clean(input.child, 60);
  if (!out.child) return { error: "The child's name is required." };
  out.kind = clean(input.kind, 20).toLowerCase();
  if (!APPOINTMENT_KINDS.includes(out.kind)) return { error: 'Type must be doctor or vaccine.' };
  out.scheduled_at = normaliseWhen(input.scheduled_at);
  if (!out.scheduled_at) return { error: 'The date and time must look like 2026-11-28T17:00.' };
  out.title = clean(input.title, 120) || (out.kind === 'vaccine' ? 'Vaccine appointment' : 'Doctor appointment');
  out.notes = clean(input.notes, 1000);
  return { value: out };
}

export async function addAppointment(spaceId, v, source) {
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `INSERT INTO appointments (space_id, child, kind, scheduled_at, title, notes, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [spaceId, child, v.kind, v.scheduled_at, v.title, v.notes || '', source]
  );
  return r.rows[0];
}

export async function getAppointment(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT * FROM appointments WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

export async function updateAppointment(spaceId, id, v) {
  const existing = await getAppointment(spaceId, id);
  if (!existing) return undefined;
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `UPDATE appointments SET child = $1, kind = $2, scheduled_at = $3, title = $4, notes = $5, updated_at = now()
     WHERE space_id = $6 AND id = $7 RETURNING *`,
    [child, v.kind, v.scheduled_at, v.title, v.notes || '', spaceId, existing.id]
  );
  return r.rows[0];
}

export async function deleteAppointment(spaceId, id) {
  const n = Number(id);
  if (Number.isInteger(n)) await pool.query('DELETE FROM appointments WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

// Soonest first.
export async function listAppointments(spaceId, { child, from } = {}) {
  const where = ['space_id = $1'];
  const vals = [spaceId];
  if (child) { vals.push(child); where.push(`lower(child) = lower($${vals.length})`); }
  if (from) { vals.push(from); where.push(`scheduled_at >= $${vals.length}`); }
  const r = await pool.query(`SELECT * FROM appointments WHERE ${where.join(' AND ')} ORDER BY scheduled_at, id LIMIT 500`, vals);
  return r.rows;
}

export async function addEntry(spaceId, v, source) {
  const child = await canonicalChild(spaceId, v.child);
  const r = await pool.query(
    `INSERT INTO entries (space_id, child, occurred_at, category, title, details, temperature, flagged, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [spaceId, child, v.occurred_at, v.category, v.title, v.details || '', v.temperature || null, !!v.flagged, source]
  );
  return r.rows[0];
}

export async function getEntry(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return undefined;
  const r = await pool.query('SELECT * FROM entries WHERE space_id = $1 AND id = $2', [spaceId, n]);
  return r.rows[0];
}

export async function updateEntry(spaceId, id, v, { markEdited = false } = {}) {
  const existing = await getEntry(spaceId, id);
  if (!existing) return undefined;
  const allowed = ['child', 'occurred_at', 'category', 'title', 'details', 'temperature', 'flagged'];
  const sets = [];
  const vals = [];
  for (const k of allowed) {
    if (v[k] !== undefined) {
      vals.push(k === 'child' ? await canonicalChild(spaceId, v[k]) : v[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (markEdited) sets.push('edited = true');
  sets.push('updated_at = now()');
  vals.push(spaceId, existing.id);
  const r = await pool.query(
    `UPDATE entries SET ${sets.join(', ')} WHERE space_id = $${vals.length - 1} AND id = $${vals.length} RETURNING *`,
    vals
  );
  return r.rows[0];
}

export async function deleteEntry(spaceId, id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return;
  await pool.query('DELETE FROM entries WHERE space_id = $1 AND id = $2', [spaceId, n]);
}

export async function listEntries(spaceId, { child, from, to, flaggedOnly, limit = 500 } = {}) {
  const where = ['space_id = $1'];
  const vals = [spaceId];
  if (child) { vals.push(child); where.push(`lower(child) = lower($${vals.length})`); }
  if (from) { vals.push(from); where.push(`occurred_at >= $${vals.length}`); }
  if (to) { vals.push(to); where.push(`occurred_at <= $${vals.length}`); }
  if (flaggedOnly) where.push('flagged = true');
  vals.push(Math.min(Math.max(Number(limit) || 500, 1), 500));
  const r = await pool.query(
    `SELECT * FROM entries WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, id DESC LIMIT $${vals.length}`,
    vals
  );
  return r.rows;
}

export async function listChildren(spaceId) {
  const r = await pool.query(
    `SELECT c.id, c.name AS child, c.dob, c.vaccine_schedule, count(e.id)::int AS entries, max(e.occurred_at) AS latest
     FROM children c LEFT JOIN entries e ON e.space_id = c.space_id AND lower(e.child) = lower(c.name)
     WHERE c.space_id = $1 GROUP BY c.id ORDER BY c.id`,
    [spaceId]
  );
  return r.rows;
}

// ---- Vaccines ----
export async function setVaccineSchedule(spaceId, childId, schedule) {
  await pool.query('UPDATE children SET vaccine_schedule = $1 WHERE space_id = $2 AND id = $3', [schedule, spaceId, childId]);
}

// Doses recorded as given for one child and schedule: { dose id: { given_on } }. given_on is null when the date was not known.
export async function givenDoses(childId, schedule) {
  const r = await pool.query('SELECT dose_id, given_on FROM vaccine_doses WHERE child_id = $1 AND schedule = $2', [childId, schedule]);
  return Object.fromEntries(r.rows.map((d) => [d.dose_id, { given_on: d.given_on }]));
}

export async function markDoses(childId, schedule, doseIds, givenOn) {
  for (const id of doseIds) {
    await pool.query(
      `INSERT INTO vaccine_doses (child_id, schedule, dose_id, given_on) VALUES ($1, $2, $3, $4)
       ON CONFLICT (child_id, schedule, dose_id) DO UPDATE SET given_on = coalesce(EXCLUDED.given_on, vaccine_doses.given_on)`,
      [childId, schedule, id, givenOn || null]
    );
  }
}

export async function unmarkDose(childId, schedule, doseId) {
  await pool.query('DELETE FROM vaccine_doses WHERE child_id = $1 AND schedule = $2 AND dose_id = $3', [childId, schedule, String(doseId)]);
}

export async function setVaccineEmails(userId, on) {
  await pool.query('UPDATE users SET vaccine_emails = $1 WHERE id = $2', [!!on, userId]);
}

// Every (child, parent) pair that could be due a reminder email: the child has a birth date and a chosen
// schedule, and that parent has turned email reminders on.
export async function reminderTargets() {
  await init();
  const r = await pool.query(
    `SELECT c.id AS child_id, c.name AS child, c.dob, c.vaccine_schedule AS schedule, s.key AS space_key,
            u.id AS user_id, u.email, u.name AS parent
     FROM children c JOIN spaces s ON s.id = c.space_id
       JOIN space_members m ON m.space_id = s.id JOIN users u ON u.id = m.user_id
     WHERE c.dob IS NOT NULL AND c.vaccine_schedule IS NOT NULL AND u.vaccine_emails
     ORDER BY c.id, u.id`
  );
  return r.rows;
}

// Records that a reminder is being sent. False means this exact reminder already went out, so it is not repeated.
export async function claimReminder(t, visitId, kind) {
  const r = await pool.query(
    'INSERT INTO vaccine_reminders (child_id, schedule, visit_id, kind, user_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [t.child_id, t.schedule, visitId, kind, t.user_id]
  );
  return r.rowCount === 1;
}

// The email could not be sent: forget the claim so the next daily run tries again.
export async function releaseReminder(t, visitId, kind) {
  await pool.query('DELETE FROM vaccine_reminders WHERE child_id = $1 AND schedule = $2 AND visit_id = $3 AND kind = $4 AND user_id = $5', [t.child_id, t.schedule, visitId, kind, t.user_id]);
}

// "2 years, 3 months" from a YYYY-MM-DD birth date. Empty string when unknown.
export function ageLabel(dob, now = new Date()) {
  if (!dob) return '';
  const [y, m, d] = dob.split('-').map(Number);
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) - (now.getDate() < d ? 1 : 0);
  if (months < 0) return '';
  if (months < 1) {
    const days = Math.max(0, Math.floor((now.getTime() - Date.UTC(y, m - 1, d)) / 86400000));
    return `${days} ${days === 1 ? 'day' : 'days'} old`;
  }
  const yrs = Math.floor(months / 12);
  months %= 12;
  const parts = [];
  if (yrs) parts.push(`${yrs} ${yrs === 1 ? 'year' : 'years'}`);
  if (months) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  return parts.join(', ');
}

// Cheap change marker so an open timeline can refresh when Claude adds something.
export async function stamp(spaceId) {
  const r = await pool.query(
    `SELECT count(*)::int AS n, coalesce(max(updated_at)::text, '') AS t,
            (SELECT count(*)::int FROM children WHERE space_id = $1) AS k,
            (SELECT count(*)::text || ':' || coalesce(max(updated_at)::text, '') FROM appointments WHERE space_id = $1) AS a
     FROM entries WHERE space_id = $1`,
    [spaceId]
  );
  return `${r.rows[0].n}:${r.rows[0].k}:${r.rows[0].t}:${r.rows[0].a}`;
}
