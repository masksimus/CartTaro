import { randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const REWARDS = Object.freeze([10, 15, 20, 25, 30, 35, 50]);
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
const previousDay = day => new Date(Date.parse(day + 'T00:00:00Z') - 86400000)
  .toISOString().slice(0, 10);

export function createStore({ filename = ':memory:', now = () => Date.now(),
                              drawCardId = () => randomInt(22) } = {}) {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 4000');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec([
    'CREATE TABLE IF NOT EXISTS account (',
    'user_id TEXT PRIMARY KEY,',
    'crystals INTEGER NOT NULL DEFAULT 0 CHECK(crystals >= 0),',
    'streak INTEGER NOT NULL DEFAULT 0 CHECK(streak >= 0),',
    'last_claim_day TEXT,',
    'total_claims INTEGER NOT NULL DEFAULT 0 CHECK(total_claims >= 0)',
    ') STRICT;',
    'CREATE TABLE IF NOT EXISTS daily_claim (',
    'user_id TEXT NOT NULL, day TEXT NOT NULL, reward INTEGER NOT NULL,',
    'PRIMARY KEY (user_id, day),',
    'FOREIGN KEY (user_id) REFERENCES account(user_id)',
    ') STRICT;',
    'CREATE TABLE IF NOT EXISTS daily_card (',
    'user_id TEXT NOT NULL, day TEXT NOT NULL,',
    'card_id INTEGER NOT NULL CHECK(card_id BETWEEN 0 AND 21),',
    'PRIMARY KEY (user_id, day),',
    'FOREIGN KEY (user_id) REFERENCES account(user_id)',
    ') STRICT;',
    'CREATE TABLE IF NOT EXISTS arcana (',
    'user_id TEXT NOT NULL,',
    'card_id INTEGER NOT NULL CHECK(card_id BETWEEN 0 AND 21),',
    'PRIMARY KEY (user_id, card_id),',
    'FOREIGN KEY (user_id) REFERENCES account(user_id)',
    ') STRICT;'
  ].join(' '));

  const ensureUser = db.prepare('INSERT OR IGNORE INTO account(user_id) VALUES (?)');
  const getAccount = db.prepare('SELECT crystals, streak, last_claim_day, total_claims FROM account WHERE user_id = ?');
  const updateClaim = db.prepare(
    'UPDATE account SET crystals = crystals + ?, streak = ?, last_claim_day = ?, ' +
    'total_claims = total_claims + 1 WHERE user_id = ?'
  );
  const insertClaim = db.prepare('INSERT OR IGNORE INTO daily_claim(user_id, day, reward) VALUES (?, ?, ?)');
  const claimed = db.prepare('SELECT reward FROM daily_claim WHERE user_id = ? AND day = ?');
  const findDailyCard = db.prepare('SELECT card_id FROM daily_card WHERE user_id = ? AND day = ?');
  const insertDailyCard = db.prepare('INSERT OR IGNORE INTO daily_card(user_id, day, card_id) VALUES (?, ?, ?)');
  const insertArcana = db.prepare('INSERT OR IGNORE INTO arcana(user_id, card_id) VALUES (?, ?)');
  const getArcana = db.prepare('SELECT card_id FROM arcana WHERE user_id = ? ORDER BY card_id');

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  function readProgress(userId) {
    const current = getAccount.get(userId) || {
      crystals: 0, streak: 0, last_claim_day: null, total_claims: 0
    };
    const day = utcDay(now());
    const claimedToday = Boolean(claimed.get(userId, day));
    const drawnToday = Boolean(findDailyCard.get(userId, day));
    const streak = current.last_claim_day === day ||
      current.last_claim_day === previousDay(day) ? current.streak : 0;
    const collected = getArcana.all(userId).map(row => row.card_id);
    return {
      crystals: current.crystals,
      streak,
      totalClaims: current.total_claims,
      dayUtc: day,
      claimedToday,
      dailyCardDrawn: drawnToday,
      arcana: collected,
      achievements: {
        firstArcana: collected.length >= 1,
        fiveArcana: collected.length >= 5,
        tenArcana: collected.length >= 10,
        completeArcana: collected.length >= 22,
        threeDayStreak: streak >= 3,
        sevenDayStreak: streak >= 7
      },
      missions: { dailyCard: drawnToday, dailyClaim: claimedToday }
    };
  }

  function claimDaily(userId) {
    return transaction(() => {
      ensureUser.run(userId);
      const today = utcDay(now());
      const already = claimed.get(userId, today);
      if (already) return { granted: false, reward: 0, progress: readProgress(userId) };
      const old = getAccount.get(userId);
      const streak = old.last_claim_day === previousDay(today) ? old.streak + 1 : 1;
      const reward = REWARDS[(streak - 1) % REWARDS.length];
      const inserted = insertClaim.run(userId, today, reward).changes;
      if (inserted !== 1) return { granted: false, reward: 0, progress: readProgress(userId) };
      updateClaim.run(reward, streak, today, userId);
      return { granted: true, reward, progress: readProgress(userId) };
    });
  }

  function drawDaily(userId) {
    return transaction(() => {
      ensureUser.run(userId);
      const today = utcDay(now());
      let card = findDailyCard.get(userId, today);
      let isNew = false;
      if (!card) {
        const cardId = drawCardId();
        if (!Number.isInteger(cardId) || cardId < 0 || cardId > 21) {
          throw new Error('Invalid server card generator');
        }
        isNew = insertDailyCard.run(userId, today, cardId).changes === 1;
        card = findDailyCard.get(userId, today);
      }
      insertArcana.run(userId, card.card_id);
      return { cardId: card.card_id, isNew, progress: readProgress(userId) };
    });
  }

  return { readProgress, claimDaily, drawDaily, close() { db.close(); } };
}
