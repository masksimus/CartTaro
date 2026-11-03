import { createServer } from 'node:http';
import { verifyVkLaunch, AuthError } from './auth.mjs';

/**
 * Isolated API prototype. No paid item endpoints and no client-submitted balance,
 * card ID, history or quest completion fields.
 */
export function createApiServer({ store, secret, appId, allowedOrigins = [],
                                  now = () => Date.now(), ttlSeconds = 900,
                                  rateLimitPerMinute = 60 } = {}) {
  if (!store || !secret || !Number.isSafeInteger(Number(appId)) || Number(appId) <= 0) {
    throw new Error('API requires a store, VK protected key and app id');
  }
  if (!Number.isSafeInteger(rateLimitPerMinute) || rateLimitPerMinute < 1 || rateLimitPerMinute > 1000) {
    throw new Error('Invalid per-user request limit');
  }
  const counters = new Map();
  const origins = new Set(allowedOrigins);
  function takeQuota(userId) {
    const t = now();
    const previous = counters.get(userId);
    if (!previous || t - previous.start >= 60000 || t < previous.start) {
      counters.set(userId, { start: t, count: 1 });
    } else if (previous.count >= rateLimitPerMinute) {
      return false;
    } else {
      previous.count++;
    }
    if (counters.size > 4096) {
      for (const [id, bucket] of counters) {
        if (t - bucket.start >= 60000) counters.delete(id);
      }
      while (counters.size > 4096) counters.delete(counters.keys().next().value);
    }
    return true;
  }
  return createServer((req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Vary', 'Origin');
    const respond = (status, value) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    if (origin && !origins.has(origin)) {
      return respond(403, { error: 'origin_denied' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return respond(204, null);

    let pathname;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.search || url.hash) return respond(400, { error: 'query_not_allowed' });
      pathname = url.pathname;
    } catch (_) {
      return respond(400, { error: 'bad_url' });
    }
    if (pathname === '/health' && req.method === 'GET') {
      return respond(200, { status: 'ok' });
    }
    const routes = {
      'GET /api/v1/progress': 'readProgress',
      'POST /api/v1/daily/claim': 'claimDaily',
      'POST /api/v1/daily/draw': 'drawDaily'
    };
    const route = routes[req.method + ' ' + pathname];
    if (!route) return respond(404, { error: 'not_found' });

    // No client-supplied amounts, card ids, ad proof, or mutations are accepted.
    if (req.method === 'POST' && (req.headers['transfer-encoding'] ||
        Number(req.headers['content-length'] || '0') !== 0)) {
      return respond(400, { error: 'body_not_allowed' });
    }
    const bearer = req.headers.authorization;
    if (typeof bearer !== 'string' || !bearer.startsWith('Bearer ')) {
      return respond(401, { error: 'unauthorized' });
    }
    let user;
    try {
      user = verifyVkLaunch(bearer.slice(7), {
        secret, appId, nowMs: now(), ttlSeconds
      });
    } catch (err) {
      if (err instanceof AuthError) return respond(401, { error: 'unauthorized' });
      return respond(500, { error: 'internal_error' });
    }
    if (!takeQuota(user.userId)) {
      res.setHeader('Retry-After', '60');
      return respond(429, { error: 'rate_limited' });
    }
    try {
      const output = store[route](user.userId);
      return respond(200, output);
    } catch (_) {
      // Never echo sensitive values or detailed server errors to clients.
      return respond(500, { error: 'internal_error' });
    }
  });
}
