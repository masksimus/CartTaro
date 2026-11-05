/*
 * Isolated V2 API for the developer test. Signed VK launch is the only
 * identity accepted. Clients cannot submit amounts, card IDs or progress.
 * Existing /api/vk/verify and published VK app remain unchanged.
 */
import { verifyVkLaunch, AuthError } from './auth.mjs';
import { timingSafeEqual } from 'node:crypto';
import { getPgStore, storageConfigured } from './pg-service.mjs';
import { createSpread } from './spreads.mjs';

const APP_ID = 54582199;
const json = (res, statusCode, data) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(data));
};

function testPinConfigured() {
  const configured = process.env.TARO_V2_TEST_ACCESS_PIN;
  return typeof configured === 'string' && /^[A-Fa-f0-9]{32}$/.test(configured);
}
function testPinMatches(input) {
  if (!testPinConfigured() || typeof input !== 'string' ||
      !/^[A-Fa-f0-9]{32}$/.test(input)) return false;
  return timingSafeEqual(
    Buffer.from(input.toLowerCase(), 'ascii'),
    Buffer.from(process.env.TARO_V2_TEST_ACCESS_PIN.toLowerCase(), 'ascii')
  );
}

function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return true; // Native clients may omit Origin. HMAC is mandatory.
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.host === req.headers?.host &&
      url.pathname === '/' && !url.search && !url.hash;
  } catch { return false; }
}

export async function handleV2(req, res, action) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin');
  const expectedMethod = ['progress', 'status', 'spreadOne', 'spreadThree'].includes(action) ? 'GET' : 'POST';
  res.setHeader('Allow', expectedMethod);

  if (!['progress', 'claim', 'draw', 'status', 'access', 'spreadOne', 'spreadThree'].includes(action)) {
    return json(res, 404, { error: 'not_found' });
  }
  if (req.method !== expectedMethod) {
    return json(res, 405, { error: 'method_not_allowed' });
  }
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.search || u.hash) return json(res, 400, { error: 'query_not_allowed' });
  } catch {
    return json(res, 400, { error: 'bad_url' });
  }
  if (!originAllowed(req)) return json(res, 403, { error: 'origin_denied' });
  if (req.headers?.['transfer-encoding'] ||
      (req.headers?.['content-length'] !== undefined &&
       Number(req.headers['content-length']) !== 0) ||
      (req.body != null && req.body !== '')) {
    return json(res, 400, { error: 'body_not_allowed' });
  }

  // Select the database BEFORE reading accounts or enabling any rewards.
  // A public game can never silently fall back to V2 developer progress.
  const publicRequested = process.env.TARO_V2_PUBLIC_GAME_ENABLED === 'true';
  const storageReadyForRequests = storageConfigured(process.env, {publicGame:publicRequested});
  const writesFlag = process.env.TARO_V2_WRITES_ENABLED === 'true';
  const developerPilot = storageReadyForRequests && writesFlag &&
    testPinConfigured() && !publicRequested;
  // Preview is a tester-only environment. Even if write flags are enabled,
  // fail closed unless an explicit allowlist of signed VK IDs is configured.
  const isV5Preview = publicRequested && process.env.VERCEL_ENV === 'preview';
  const rawAllowed = (process.env.TARO_V5_UAT_USER_IDS || '').split(',')
    .map(value => value.trim());
  const allowedUserIdsValid = rawAllowed.length >= 1 && rawAllowed.length <= 5 &&
    rawAllowed.every(id => /^[1-9][0-9]{0,15}$/.test(id)) &&
    new Set(rawAllowed).size === rawAllowed.length;
  const uatReady = !isV5Preview ||
    (process.env.TARO_V5_UAT_MODE === 'true' && allowedUserIdsValid);
  const publicGame = storageReadyForRequests && writesFlag &&
    publicRequested && !testPinConfigured() && uatReady;
  const writesEnabled = developerPilot || publicGame;
  if (action === 'status') {
    return json(res, 200, {
      service: 'tarot-v2-postgres',
      appId: APP_ID,
      storageConfigured: storageReadyForRequests,
      rewardsEnabled: writesEnabled,
      mode: publicGame ? 'public_game' : developerPilot ? 'developer_pilot' : 'read_only'
    });
  }

  const key = process.env.VK_PROTECTED_KEY;
  if (typeof key !== 'string' || key.length < 16) {
    return json(res, 503, { error: 'auth_not_configured' });
  }
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' ||
      authorization.length > 8199 || !authorization.startsWith('Bearer ')) {
    return json(res, 401, { error: 'unauthorized' });
  }
  let user;
  try {
    user = verifyVkLaunch(authorization.slice(7), {
      secret: key, appId: APP_ID, nowMs: Date.now(), ttlSeconds: 900
    });
  } catch (e) {
    if (e instanceof AuthError) return json(res, 401, { error: 'unauthorized' });
    return json(res, 500, { error: 'internal_error' });
  }
  if (isV5Preview) {
    if (!uatReady) return json(res, 503, { error: 'uat_access_not_configured' });
    if (!rawAllowed.includes(user.userId)) {
      return json(res, 403, { error: 'uat_access_denied' });
    }
  }
  if (action === 'spreadOne' || action === 'spreadThree') {
    // Read-only, signed VK-only entertainment. No DB writes, no rewards,
    // no per-user history, no access PIN required for the spread.
    try {
      return json(res, 200, createSpread(action === 'spreadOne' ? 1 : 3));
    } catch {
      return json(res, 503, { error: 'spread_unavailable' });
    }
  }
  if (!storageReadyForRequests) {
    return json(res, 503, { error: 'storage_not_configured' });
  }
  if ((action === 'claim' || action === 'draw' || action === 'access') && !writesEnabled) {
    return json(res, 503, { error: 'rewards_disabled' });
  }
  if (action === 'access' && !developerPilot) {
    return json(res, 404, { error: 'not_found' });
  }
  if (developerPilot && (action === 'access' || action === 'claim' || action === 'draw')) {
    // Preserve the developer-only PIN gate while the public mode stays off.
    if (!testPinMatches(req.headers?.['x-taro-test-pin'])) {
      return json(res, 403, { error: 'test_access_denied' });
    }
  }
  if (action === 'access') {
    return json(res, 200, { authorized: true });
  }
  try {
    const store = getPgStore({publicGame:publicRequested});
    const data = action === 'progress' ?
      await store.readProgress(user.userId) :
      action === 'claim' ? await store.claimDaily(user.userId) :
      await store.drawDaily(user.userId);
    return json(res, 200, data);
  } catch {
    // Never reflect database errors, credentials or user identifiers.
    return json(res, 503, { error: 'storage_unavailable' });
  }
}
