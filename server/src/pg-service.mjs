/*
 * CartTaro PostgreSQL storage factory.
 * V2 developer data and V5 public game MUST use different databases.
 * No silent fallback from a missing public connection to the developer DB.
 * Never expose either connection string in JSON responses or logs.
 */
import pg from 'pg';
import { createPgStore } from './pg-store.mjs';

const stores = new Map();

function validPgUrl(value) {
  if (typeof value !== 'string' || value.length <= 24 || !/^postgres(?:ql)?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return Boolean(parsed.hostname && parsed.pathname && parsed.pathname !== '/');
  } catch { return false; }
}

export function storageConfigured(env = process.env, { publicGame = false } = {}) {
  if (!publicGame) return validPgUrl(env.DATABASE_URL);
  const v5 = env.TARO_V5_DATABASE_URL;
  if (!validPgUrl(v5)) return false;
  if (!validPgUrl(env.DATABASE_URL)) return true;
  const test = new URL(env.DATABASE_URL), game = new URL(v5);
  // A different password/query string/user does not constitute a new DB.
  if (test.hostname === game.hostname &&
      test.port === game.port &&
      decodeURIComponent(test.pathname) === decodeURIComponent(game.pathname)) return false;
  return v5 !== env.DATABASE_URL;
}

export function getPgStore({ publicGame = false } = {}) {
  if (!storageConfigured(process.env, { publicGame })) throw new Error('PostgreSQL storage not configured for requested mode');
  const mode = publicGame ? 'v5' : 'v2';
  if (!stores.has(mode)) {
    const pool = new pg.Pool({
      connectionString: publicGame ? process.env.TARO_V5_DATABASE_URL : process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 8500,
      query_timeout: 11000,
      statement_timeout: 9000,
      idleTimeoutMillis: 20000,
      allowExitOnIdle: true
    });
    stores.set(mode, createPgStore({ pool }));
  }
  return stores.get(mode);
}
