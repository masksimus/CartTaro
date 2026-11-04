/*
 * Isolated CartTaro V2 PostgreSQL game economy.
 * Per-user row locks + unique day constraints make rewards/cards idempotent
 * across independently running Vercel instances. Never mutates legacy data.
 */
import { randomInt } from 'node:crypto';

const REWARDS = Object.freeze([10, 15, 20, 25, 30, 35, 50]);
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const previousDay = day =>
  new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS tarot_v2_accounts (" +
    "user_id TEXT PRIMARY KEY CHECK (user_id ~ '^[1-9][0-9]{0,15}$')," +
    "crystals INTEGER NOT NULL DEFAULT 0 CHECK (crystals>=0)," +
    "streak INTEGER NOT NULL DEFAULT 0 CHECK (streak>=0)," +
    "last_claim_day DATE," +
    "total_claims INTEGER NOT NULL DEFAULT 0 CHECK (total_claims>=0));",
  "CREATE TABLE IF NOT EXISTS tarot_v2_claims (" +
    "user_id TEXT NOT NULL REFERENCES tarot_v2_accounts(user_id)," +
    "day_utc DATE NOT NULL," +
    "reward INTEGER NOT NULL CHECK (reward>0)," +
    "PRIMARY KEY (user_id,day_utc));",
  "CREATE TABLE IF NOT EXISTS tarot_v2_daily_cards (" +
    "user_id TEXT NOT NULL REFERENCES tarot_v2_accounts(user_id)," +
    "day_utc DATE NOT NULL," +
    "card_id INTEGER NOT NULL CHECK (card_id BETWEEN 0 AND 21)," +
    "PRIMARY KEY (user_id,day_utc));",
  "CREATE TABLE IF NOT EXISTS tarot_v2_arcana (" +
    "user_id TEXT NOT NULL REFERENCES tarot_v2_accounts(user_id)," +
    "card_id INTEGER NOT NULL CHECK (card_id BETWEEN 0 AND 21)," +
    "PRIMARY KEY (user_id,card_id));"
].join('\n');

const USER_RE = /^[1-9]\d{0,15}$/;
export function createPgStore({ pool, now = () => Date.now(),
  drawCardId = () => randomInt(22) } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('Postgres Pool required');
  let schemaPromise = null;

  async function ensureSchema() {
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [54582199, 2]);
        await client.query(SCHEMA);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
    return schemaPromise;
  }

  async function withClient(fn) {
    await ensureSchema();
    const client = await pool.connect();
    try { return await fn(client); } finally { client.release(); }
  }

  async function transact(fn) {
    return withClient(async client => {
      await client.query('BEGIN');
      try {
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async function progressIn(client, userId, day) {
    const account = await client.query(
      "SELECT crystals, streak, to_char(last_claim_day,'YYYY-MM-DD') AS last_claim_day," +
      " total_claims FROM tarot_v2_accounts WHERE user_id=$1", [userId]);
    const claim = await client.query(
      'SELECT 1 FROM tarot_v2_claims WHERE user_id=$1 AND day_utc=$2', [userId, day]);
    const draw = await client.query(
      'SELECT card_id FROM tarot_v2_daily_cards WHERE user_id=$1 AND day_utc=$2', [userId, day]);
    const cards = await client.query(
      'SELECT card_id FROM tarot_v2_arcana WHERE user_id=$1 ORDER BY card_id', [userId]);
    const row = account.rows[0] || {
      crystals: 0, streak: 0, last_claim_day: null, total_claims: 0
    };
    const streak = row.last_claim_day === day ||
      row.last_claim_day === previousDay(day) ? row.streak : 0;
    const arcana = cards.rows.map(r => r.card_id);
    const claimedToday = claim.rows.length > 0;
    const dailyCardDrawn = draw.rows.length > 0;
    return {
      crystals: row.crystals, streak, totalClaims: row.total_claims,
      dayUtc: day, claimedToday, dailyCardDrawn,
      // Preserve the original server-assigned card across VK app reloads.
      // Older clients can ignore this new read-only field.
      dailyCardId: dailyCardDrawn ? draw.rows[0].card_id : null,
      arcana,
      achievements: {
        firstArcana: arcana.length >= 1,
        fiveArcana: arcana.length >= 5,
        tenArcana: arcana.length >= 10,
        completeArcana: arcana.length >= 22,
        threeDayStreak: streak >= 3,
        sevenDayStreak: streak >= 7
      },
      missions: { dailyCard: dailyCardDrawn, dailyClaim: claimedToday }
    };
  }

  function validateUser(userId) {
    if (typeof userId !== 'string' || !USER_RE.test(userId)) {
      throw new Error('Invalid signed user ID');
    }
  }

  async function readProgress(userId) {
    validateUser(userId);
    return withClient(async client => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const result = await progressIn(client, userId, utcDay(now()));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    });
  }

  async function lockAccount(client, userId) {
    await client.query(
      'INSERT INTO tarot_v2_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING', [userId]);
    const rows = await client.query(
      "SELECT streak, to_char(last_claim_day,'YYYY-MM-DD') AS last_claim_day" +
      " FROM tarot_v2_accounts WHERE user_id=$1 FOR UPDATE", [userId]);
    if (rows.rows.length !== 1) throw new Error('Account lock failed');
    return rows.rows[0];
  }

  async function claimDaily(userId) {
    validateUser(userId);
    return transact(async client => {
      const account = await lockAccount(client, userId);
      const day = utcDay(now());
      const streak = account.last_claim_day === previousDay(day) ?
        account.streak + 1 : 1;
      const reward = REWARDS[(streak - 1) % REWARDS.length];
      const inserted = await client.query(
        'INSERT INTO tarot_v2_claims(user_id,day_utc,reward)' +
        ' VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING reward',
        [userId, day, reward]);
      if (!inserted.rows.length) {
        return { granted: false, reward: 0,
          progress: await progressIn(client, userId, day) };
      }
      await client.query(
        'UPDATE tarot_v2_accounts SET crystals=crystals+$2, streak=$3,' +
        ' last_claim_day=$4, total_claims=total_claims+1 WHERE user_id=$1',
        [userId, reward, streak, day]);
      return { granted: true, reward,
        progress: await progressIn(client, userId, day) };
    });
  }

  async function drawDaily(userId) {
    validateUser(userId);
    return transact(async client => {
      await lockAccount(client, userId);
      const day = utcDay(now());
      let row = await client.query(
        'SELECT card_id FROM tarot_v2_daily_cards WHERE user_id=$1 AND day_utc=$2',
        [userId, day]);
      let isNew = false;
      if (!row.rows.length) {
        const cardId = drawCardId();
        if (!Number.isInteger(cardId) || cardId < 0 || cardId > 21) {
          throw new Error('Invalid server card generator');
        }
        row = await client.query(
          'INSERT INTO tarot_v2_daily_cards(user_id,day_utc,card_id)' +
          ' VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING card_id',
          [userId, day, cardId]);
        if (!row.rows.length) throw new Error('Daily card conflict after user lock');
        isNew = true;
      }
      const cardId = row.rows[0].card_id;
      await client.query(
        'INSERT INTO tarot_v2_arcana(user_id,card_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [userId, cardId]);
      return { cardId, isNew, progress: await progressIn(client, userId, day) };
    });
  }

  async function check() {
    return withClient(async client => {
      const result = await client.query('SELECT 1 AS connected');
      return result.rows[0]?.connected === 1;
    });
  }

  return { ensureSchema, readProgress, claimDaily, drawDaily, check };
}
