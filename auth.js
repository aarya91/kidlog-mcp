// Google sign-in and login sessions. No extra libraries: plain fetch and a sessions table.
import crypto from 'node:crypto';
import * as db from './db.js';
import * as views from './views.js';

const SESSION_COOKIE = 'kl_session';
const STATE_COOKIE = 'kl_oauth';
const SESSION_DAYS = 30;

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = (baseUrl) => `${baseUrl}/auth/google/callback`;

function readCookie(req, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(req.headers.cookie || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
}

// HttpOnly so page scripts cannot read it; Lax so other sites cannot submit forms as the parent.
function setCookie(req, res, name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (req.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

// Sets req.user ({ id, email, name }) when the visitor is signed in, otherwise null.
export async function loadUser(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  req.user = token ? (await db.userBySession(token)) || null : null;
  next();
}

// Step 1: send the parent to Google. ?claim=<family key> remembers an older timeline to attach afterwards;
// ?join=<invite token> remembers an invite from another parent.
export function googleStart(req, res, baseUrl) {
  if (!clientId() || !clientSecret()) {
    return res.status(500).send(views.notFound('Google sign-in is not set up yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'));
  }
  const state = crypto.randomBytes(18).toString('base64url');
  const claim = /^[\w-]{1,64}$/.test(String(req.query.claim || '')) ? String(req.query.claim) : '';
  const join = /^[\w-]{1,64}$/.test(String(req.query.join || '')) ? String(req.query.join) : '';
  setCookie(req, res, STATE_COOKIE, `${state}.${claim}.${join}`, 600);
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(baseUrl), response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account',
  });
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

// Step 2: Google sends the parent back with a one-time code. Swap it for their identity and sign them in.
export async function googleCallback(req, res, baseUrl) {
  const [state, claim, join] = readCookie(req, STATE_COOKIE).split('.');
  setCookie(req, res, STATE_COOKIE, '', 0);
  const failed = () => res.status(400).send(views.notFound('Sign-in did not complete. Please go back and try again.'));
  if (!state || req.query.state !== state || typeof req.query.code !== 'string') return failed();

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: req.query.code, client_id: clientId(), client_secret: clientSecret(),
      redirect_uri: redirectUri(baseUrl), grant_type: 'authorization_code',
    }),
  });
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || typeof tok.id_token !== 'string') return failed();

  // The ID token came straight from Google over HTTPS, so its contents can be trusted once the audience matches.
  let who;
  try { who = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()); } catch { return failed(); }
  const issuerOk = who.iss === 'https://accounts.google.com' || who.iss === 'accounts.google.com';
  if (!who.sub || who.aud !== clientId() || !issuerOk || !who.email || who.email_verified === false) return failed();

  const user = await db.upsertUser({ sub: who.sub, email: who.email, name: who.name });
  setCookie(req, res, SESSION_COOKIE, await db.createSession(user.id, SESSION_DAYS), SESSION_DAYS * 86400);

  let space = await db.spaceByUser(user.id);
  if (join) {
    // Invited by another parent: join their family, or let the invite page explain why that is not possible.
    if (!space) space = await db.acceptInvite(join, user.id);
    return res.redirect(303, space ? `/f/${space.key}` : `/join/${join}`);
  }
  if (!space && claim) space = await db.claimSpace(claim, user.id);
  res.redirect(303, space ? `/f/${space.key}` : '/signup');
}

export async function logout(req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.deleteSession(token);
  setCookie(req, res, SESSION_COOKIE, '', 0);
  res.redirect(303, '/');
}
