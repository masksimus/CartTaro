/*
 * Minimal V2 Postgres reachability probe for the isolated developer pilot.
 * Does not read any user account or reveal credentials, hostnames, schemas or
 * provider error strings. Never awards crystals or draws a card.
 */
import { getPgStore, storageConfigured } from '../../server/src/pg-service.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=30, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Allow', 'GET');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }
  if (!storageConfigured()) {
    res.statusCode = 503;
    return res.end(JSON.stringify({
      service: 'tarot-v2-postgres', ready: false,
      database: 'not_configured', rewardsEnabled: false
    }));
  }
  try {
    // Runs the same first-time schema/bootstrap path as the real progress
    // endpoint, then an actual SELECT 1. It does not read private user data.
    const ready = await getPgStore().check();
    res.statusCode = ready ? 200 : 503;
    return res.end(JSON.stringify({
      service: 'tarot-v2-postgres', ready: Boolean(ready),
      database: ready ? 'connected' : 'unavailable',
      rewardsEnabled: process.env.TARO_V2_WRITES_ENABLED === 'true'
    }));
  } catch {
    res.statusCode = 503;
    return res.end(JSON.stringify({
      service: 'tarot-v2-postgres', ready: false,
      database: 'unavailable', rewardsEnabled: false
    }));
  }
}
