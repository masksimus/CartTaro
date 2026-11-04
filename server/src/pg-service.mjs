/*
 * Vercel Node.js runtime persistent store factory.
 * Only DATABASE_URL is supported; never use a local SQLite file on Vercel.
 * No migrations are ever performed on legacy tables.
 */
import pg from 'pg';
import { createPgStore } from './pg-store.mjs';

let singleton = null;

export function storageConfigured(env = process.env) {
  return typeof env.DATABASE_URL === 'string' &&
    /^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL) &&
    env.DATABASE_URL.length > 24;
}

export function getPgStore() {
  if (!storageConfigured()) throw new Error('DATABASE_URL is not configured');
  if (!singleton) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 6000,
      idleTimeoutMillis: 20000,
      allowExitOnIdle: true
    });
    singleton = createPgStore({ pool });
  }
  return singleton;
}
