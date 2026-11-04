import { verifyVkLaunch, AuthError } from '../../server/src/auth.mjs';

/**
 * Stateless, READ-ONLY VK Mini Apps HMAC verification.
 * Does not connect to databases, draw cards, spend/award crystals or accept
 * any client-submitted numeric game state.
 *
 * VK_PROTECTED_KEY must be configured only in Vercel Preview environment.
 * NEVER commit it or send it in a browser link.
 */
const APP_ID = 54582199;
const json = (res, code, payload) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Allow', 'POST');

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' });
  }
  // Never permit URL query strings on authentication APIs: server-side
  // infrastructure could otherwise log sensitive VK launch parameters.
  try {
    if (new URL(req.url || '/', 'http://localhost').search) {
      return json(res, 400, { error: 'query_not_allowed' });
    }
  } catch {
    return json(res, 400, { error: 'bad_url' });
  }
  // Cross-origin web requests are not supported. This is defense in depth;
  // HMAC verification is the actual authorization boundary.
  const origin = req.headers?.origin;
  if (origin) {
    let domain;
    try { domain = new URL(origin); } catch { return json(res, 403, { error: 'origin_denied' }); }
    if (domain.protocol !== 'https:' ||
        domain.host !== req.headers?.host ||
        domain.pathname !== '/' || domain.search || domain.hash) {
      return json(res, 403, { error: 'origin_denied' });
    }
  }
  const len = req.headers?.['content-length'];
  if ((len !== undefined && len !== '0') ||
      req.headers?.['transfer-encoding'] ||
      (req.body !== undefined && req.body !== null && req.body !== '')) {
    return json(res, 400, { error: 'body_not_allowed' });
  }
  const secret = process.env.VK_PROTECTED_KEY;
  if (typeof secret !== 'string' || secret.length < 16) {
    return json(res, 503, { error: 'auth_not_configured' });
  }

  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' ||
      authorization.length > 8199 ||
      !authorization.startsWith('Bearer ')) {
    return json(res, 401, { error: 'unauthorized' });
  }

  try {
    // Server verifies the VK HMAC, app ID, user ID and a short-lived timestamp.
    verifyVkLaunch(authorization.slice(7), {
      secret, appId: APP_ID, nowMs: Date.now(), ttlSeconds: 900
    });
    return json(res, 200, { verified: true, appId: APP_ID });
  } catch (error) {
    if (error instanceof AuthError) {
      return json(res, 401, { error: 'unauthorized' });
    }
    return json(res, 500, { error: 'internal_error' });
  }
}
