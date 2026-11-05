import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import pg from 'pg';
import { createPgStore } from '../src/pg-store.mjs';
import { storageConfigured } from '../src/pg-service.mjs';

test('dedicated game storage is mandatory and must not reuse the developer DB', async (t) => {
  const oldUrl=process.env.PGTEST_URL, gameUrl=process.env.PGTEST_V5_URL;
  const legacy={ DATABASE_URL: oldUrl };
  assert.equal(storageConfigured(legacy,{publicGame:true}),false);
  assert.equal(storageConfigured({...legacy,TARO_V5_DATABASE_URL:oldUrl},{publicGame:true}),false);
  if (!gameUrl) { t.diagnostic('No second Postgres fixture; skip physical isolation checks.'); return; }
  assert.equal(storageConfigured({...legacy,TARO_V5_DATABASE_URL:gameUrl},{publicGame:true}),true);
  const poolV2=new pg.Pool({connectionString:oldUrl,max:3});
  const poolV5=new pg.Pool({connectionString:gameUrl,max:3});
  try {
    const dbV2=(await poolV2.query('SELECT current_database() AS name')).rows[0].name;
    const dbV5=(await poolV5.query('SELECT current_database() AS name')).rows[0].name;
    assert.notEqual(dbV2,dbV5,'CI must use separate physical PostgreSQL databases');
    const user=String(randomInt(100000000,900000000));
    const legacyStore=createPgStore({pool:poolV2,drawCardId:()=>3});
    const releaseStore=createPgStore({pool:poolV5,drawCardId:()=>15});
    const releaseClaim=await releaseStore.claimDaily(user);
    const releaseDraw=await releaseStore.drawDaily(user);
    assert.equal(releaseClaim.granted,true);
    assert.equal(releaseDraw.cardId,15);
    const v2Before=await legacyStore.readProgress(user);
    assert.equal(v2Before.crystals,0);
    assert.deepEqual(v2Before.arcana,[]);
    await legacyStore.claimDaily(user);
    await legacyStore.drawDaily(user);
    const v5After=await releaseStore.readProgress(user);
    assert.equal(v5After.crystals,10);
    assert.deepEqual(v5After.arcana,[15]);
    assert.equal((await legacyStore.readProgress(user)).dailyCardId,3);
  } finally {
    await poolV2.end();
    await poolV5.end();
  }
});
