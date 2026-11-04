import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPgStore } from '../src/pg-store.mjs';

if (!process.env.PGTEST_URL) throw new Error('PGTEST_URL required for real Postgres integration tests');
const config = { connectionString: process.env.PGTEST_URL, max: 10 };
const pool = new pg.Pool(config);
after(async () => { await pool.end(); });

const uid = prefix => String(prefix + Math.floor(Math.random() * 99999999)).padStart(9, '1');

test('new user has no progress; persistent store bootstraps isolated schema', async () => {
  const store = createPgStore({pool});
  await store.ensureSchema();
  const progress = await store.readProgress(uid(800000000));
  assert.equal(progress.crystals, 0);
  assert.equal(progress.streak, 0);
  assert.equal(progress.totalClaims, 0);
  assert.deepEqual(progress.arcana, []);
  assert.equal(progress.claimedToday, false);
  assert.equal(progress.dailyCardDrawn, false);
});

test('concurrent claims across TWO independent pools grant exactly once', async () => {
  const poolB = new pg.Pool(config);
  try {
    const id = uid(900000000);
    const storeA = createPgStore({pool, now: () => Date.UTC(2026, 10, 4, 10)});
    const storeB = createPgStore({pool: poolB, now: () => Date.UTC(2026, 10, 4, 10)});
    const grants = await Promise.all(Array.from({length: 24}, (_, i) =>
      (i % 2 ? storeA : storeB).claimDaily(id)));
    assert.equal(grants.filter(x => x.granted).length, 1);
    assert.equal(grants.reduce((n, x) => n + x.reward, 0), 10);
    assert.ok(grants.every(x => x.progress.claimedToday === true));
    const saved = await storeB.readProgress(id);
    assert.equal(saved.crystals, 10);
    assert.equal(saved.streak, 1);
    assert.equal(saved.totalClaims, 1);
  } finally {
    await poolB.end();
  }
});

test('daily draw is unique across parallel calls, persists after pool recreation', async () => {
  const id = uid(700000000);
  const t = Date.UTC(2026, 10, 4, 12);
  const a = createPgStore({pool, now: () => t, drawCardId: () => 7});
  const poolB = new pg.Pool(config);
  try {
    const b = createPgStore({pool: poolB, now: () => t, drawCardId: () => 19});
    const results = await Promise.all(Array.from({length: 18}, (_, i) =>
      (i % 2 ? a : b).drawDaily(id)));
    assert.equal(results.filter(x => x.isNew).length, 1);
    const onlyCard = results[0].cardId;
    assert.ok(onlyCard === 7 || onlyCard === 19);
    assert.ok(results.every(x => x.cardId === onlyCard));
    const persisted = await b.readProgress(id);
    assert.deepEqual(persisted.arcana, [onlyCard]);
    assert.equal(persisted.dailyCardDrawn, true);
    assert.equal(persisted.crystals, 0);
  } finally {
    await poolB.end();
  }
});

test('streak cycles, skips reset and totals persist between days and store instances', async () => {
  const id = uid(600000000);
  let day = Date.UTC(2026, 10, 1, 6);
  const a = createPgStore({pool, now: () => day, drawCardId: () => 6});
  for (const reward of [10,15,20,25,30,35,50,10]) {
    const result = await a.claimDaily(id);
    assert.equal(result.granted, true);
    assert.equal(result.reward, reward);
    day += 86400000;
  }
  const b = createPgStore({pool, now: () => day});
  let progress = await b.readProgress(id);
  assert.equal(progress.crystals, 195);
  assert.equal(progress.streak, 8);
  assert.equal(progress.totalClaims, 8);
  day += 86400000; // miss one day
  progress = await b.readProgress(id);
  assert.equal(progress.streak, 0);
  const claim = await b.claimDaily(id);
  assert.equal(claim.reward, 10);
  assert.equal(claim.progress.streak, 1);
  assert.equal(claim.progress.crystals, 205);
});

test('per-user isolation, invalid input, invalid draw, no phantom rewards', async () => {
  const id1=uid(500000000), id2=uid(400000000);
  const s = createPgStore({pool, now: () => Date.UTC(2026,10,4), drawCardId:()=>5});
  const bad = createPgStore({pool, now: () => Date.UTC(2026,10,4), drawCardId:()=>99});
  await s.claimDaily(id1);
  await s.drawDaily(id1);
  assert.equal((await s.readProgress(id2)).crystals,0);
  assert.deepEqual((await s.readProgress(id2)).arcana,[]);
  await assert.rejects(()=>s.claimDaily('NOT-A-USER'),/Invalid signed user ID/);
  await assert.rejects(()=>bad.drawDaily(id2),/Invalid server card generator/);
  assert.equal((await s.readProgress(id2)).dailyCardDrawn,false);
  assert.equal(await s.check(),true);
});
