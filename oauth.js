// Sign-in for the Claude connector (OAuth 2.1). Claude sends the parent to KidLog, the parent signs in
// with Google and approves, and Claude gets a token that works only for that parent's family.
// The standard endpoints (discovery, /register, /authorize, /token, /revoke) come from the MCP SDK;
// this file supplies the storage, the approval step and the token rules.
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidGrantError, InvalidTokenError, InvalidTargetError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import * as db from './db.js';
import * as views from './views.js';
import { rememberNext } from './auth.js';

const PENDING_SECONDS = 10 * 60;        // time to read the approval page
const CODE_SECONDS = 5 * 60;            // one-time code Claude swaps for tokens
const ACCESS_SECONDS = 60 * 60;         // Claude refreshes the access token every hour
const REFRESH_SECONDS = 90 * 86400;     // unused connections expire after 90 days
const REFRESH_GRACE_SECONDS = 60;       // an old refresh token survives briefly in case the reply was lost

const same = (a, b) => String(a).replace(/\/$/, '') === String(b).replace(/\/$/, '');
export const mcpUrl = (base) => `${base}/mcp`;

function provider(base) {
  const issue = async (g) => ({
    access_token: await db.oauthCreateGrant({ kind: 'access', clientId: g.client_id, userId: g.user_id, resource: g.resource, seconds: ACCESS_SECONDS }),
    token_type: 'Bearer',
    expires_in: ACCESS_SECONDS,
    refresh_token: await db.oauthCreateGrant({ kind: 'refresh', clientId: g.client_id, userId: g.user_id, resource: g.resource, seconds: REFRESH_SECONDS }),
  });

  return {
    clientsStore: {
      getClient: (id) => db.oauthGetClient(id),
      registerClient: (client) => db.oauthSaveClient(client),
    },

    // Called once the SDK has checked the client and its redirect address.
    async authorize(client, params, res) {
      const req = res.req;
      if (params.resource && !same(params.resource.href, mcpUrl(base))) throw new InvalidTargetError('This server only issues tokens for its own MCP address.');
      // Not signed in, or no family yet: do that first, then come straight back here.
      if (!req.user) { rememberNext(req, res); return res.redirect(303, '/auth/google'); }
      const space = await db.spaceByUser(req.user.id);
      if (!space) { rememberNext(req, res); return res.redirect(303, '/signup'); }
      const id = await db.oauthCreateGrant({
        kind: 'pending', clientId: client.client_id, userId: req.user.id, redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge, state: params.state, resource: mcpUrl(base), seconds: PENDING_SECONDS,
      });
      res.send(views.consent({ space, user: req.user, id, clientName: client.client_name, redirectHost: new URL(params.redirectUri).host }));
    },

    async challengeForAuthorizationCode(client, code) {
      const g = await db.oauthGetGrant(code, 'code');
      if (!g || g.client_id !== client.client_id) throw new InvalidGrantError('This authorization code is not valid.');
      return g.code_challenge;
    },

    async exchangeAuthorizationCode(client, code, _verifier, redirectUri) {
      const g = await db.oauthTakeGrant(code, 'code');
      if (!g || g.client_id !== client.client_id) throw new InvalidGrantError('This authorization code is not valid.');
      if (redirectUri && redirectUri !== g.redirect_uri) throw new InvalidGrantError('The redirect address does not match.');
      return issue(g);
    },

    // Each refresh hands out a new refresh token and retires the old one.
    async exchangeRefreshToken(client, refreshToken) {
      const g = await db.oauthGetGrant(refreshToken, 'refresh');
      if (!g || g.client_id !== client.client_id) throw new InvalidGrantError('This refresh token is no longer valid.');
      await db.oauthExpireSoon(refreshToken, REFRESH_GRACE_SECONDS);
      return issue(g);
    },

    async verifyAccessToken(token) {
      const g = await db.oauthGetGrant(token, 'access');
      if (!g) throw new InvalidTokenError('This access token is not valid or has expired.');
      return {
        token, clientId: g.client_id, scopes: [], expiresAt: Math.floor(new Date(g.expires_at).getTime() / 1000),
        resource: new URL(g.resource), extra: { userId: g.user_id },
      };
    },

    async revokeToken(client, request) {
      await db.oauthDeleteGrant(request.token, client.client_id);
    },
  };
}

// The site's address normally comes from PUBLIC_URL; without it, the request's host is used, so keep one set per address.
const cache = new Map();
function forBase(base) {
  if (!cache.has(base)) {
    if (cache.size >= 5) cache.clear();
    const p = provider(base);
    const noLimit = { rateLimit: false }; // in-memory limits do nothing on serverless hosts
    cache.set(base, {
      router: mcpAuthRouter({
        provider: p, issuerUrl: new URL(base), resourceServerUrl: new URL(mcpUrl(base)), resourceName: 'KidLog',
        serviceDocumentationUrl: new URL(`${base}/how-it-works`),
        authorizationOptions: noLimit, tokenOptions: noLimit, revocationOptions: noLimit,
        clientRegistrationOptions: { ...noLimit, clientSecretExpirySeconds: 0 },
      }),
      bearer: requireBearerAuth({
        verifier: p, expectedResource: mcpUrl(base),
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(mcpUrl(base))),
      }),
    });
  }
  return cache.get(base);
}

// Discovery documents, /register, /authorize, /token and /revoke.
export const router = (baseUrl) => (req, res, next) => {
  let set;
  try { set = forBase(baseUrl(req)); } catch { return next(); } // e.g. plain http on a real host: OAuth is simply not offered
  set.router(req, res, next);
};

// Guards the MCP endpoint: no valid token means 401 with a pointer to the sign-in details, which is what starts sign-in in Claude.
export const requireToken = (baseUrl) => (req, res, next) => {
  let set;
  try { set = forBase(baseUrl(req)); } catch { return res.status(500).json({ error: 'server_error', error_description: 'Set PUBLIC_URL to an https address.' }); }
  set.bearer(req, res, next);
};

// The parent pressed Allow or Cancel on the approval page.
export async function consent(req, res) {
  const failed = (msg) => res.status(400).send(views.notFound(msg));
  if (!req.user) return failed('Please go back to Claude and connect KidLog again.');
  const g = await db.oauthTakeGrant(req.body?.id, 'pending');
  if (!g || g.user_id !== req.user.id) return failed('This approval page has expired. Go back to Claude and connect KidLog again.');
  const to = new URL(g.redirect_uri);
  if (g.state) to.searchParams.set('state', g.state);
  if (req.body.action === 'allow') {
    to.searchParams.set('code', await db.oauthCreateGrant({
      kind: 'code', clientId: g.client_id, userId: g.user_id, redirectUri: g.redirect_uri,
      codeChallenge: g.code_challenge, resource: g.resource, seconds: CODE_SECONDS,
    }));
  } else {
    to.searchParams.set('error', 'access_denied');
    to.searchParams.set('error_description', 'The parent did not allow the connection.');
  }
  res.redirect(303, to.href);
}
