import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyVkLaunch, AuthError } from '../src/auth.mjs';
import { createStore } from '../src/store.mjs';
import { createApiServer } from '../src/http.mjs';

const SECRET = 'test-key-only-not-a-vk-secret';
const APP = 54582199;
const stamp = Date.parse('2026-11-03T12:00:00Z');
const sign = (params, key = SECRET) => {
  const p = new URLSearchParams(params);
  const signed = [...p].filter(([k]) => k.startsWith('vk_'))
    .sort(([a], [b]) => a.localeCompare(b));
  return createHmac('sha256', key).update(new URLSearchParams(signed).toString()).digest('base64url');
};
function launch({ userId = '1234', appId = APP, ts = Math.floor(stamp / 1000), extras = {} } = {}) {
  const p = new URLSearchParams({
    vk_app_id: String(appId), vk_user_id: String(userId),
    vk_platform: 'mobile_web', vk_ts: String(ts),
    ...extras
  });
  p.set('sign', sign(p));
  return p.toString();
}
const authenticate = (raw, nowMs = stamp) => verifyVkLaunch(raw, {
  secret: SECRET, appId: APP, nowMs, ttlSeconds: 900
});

test('VK signed launch: accepted only when app, user, timestamp and HMAC are valid', () => {
  assert.equal(authenticate(launch()).userId, '1234');
  assert.equal(authenticate('?' + launch({ userId: '555' })).userId, '555');
  const tampered = new URLSearchParams(launch());
  tampered.set('vk_user_id', '9999');
  assert.throws(() => authenticate(tampered.toString()), AuthError);
  assert.throws(() => authenticate(launch({ appId: 1 })), AuthError);
  assert.throws(() => authenticate(launch({ userId: 'abc' })), AuthError);
  assert.throws(() => authenticate(launch({ ts: Math.floor(stamp / 1000) - 901 })), AuthError);
  assert.throws(() => authenticate(launch({ ts: Math.floor(stamp / 1000) + 61 })), AuthError);
  assert.equal(authenticate(launch({ ts: Math.floor(stamp / 1000) + 20 }), stamp + 100).userId, '1234');
  assert.throws(() => authenticate(launch().replace('&sign=', '&vk_user_id=88&sign=')), AuthError);
  assert.throws(() => authenticate(launch() + '&sign=xxx'), AuthError);
  assert.throws(() => authenticate('vk_app_id=' + APP + '&vk_user_id=7&vk_ts=123'), AuthError);
});

test('SQLite claim: exactly once per UTC day, streaks reset after a missed day', () => {
  let time = stamp;
  const store = createStore({ now: () => time, drawCardId: () => 3 });
  try {
    const first = store.claimDaily('1234');
    assert.equal(first.granted, true);
    assert.equal(first.reward, 10);
    assert.equal(first.progress.crystals, 10);
    assert.deepEqual(store.claimDaily('1234').progress.crystals, 10);
    assert.equal(store.claimDaily('1234').granted, false);
    assert.equal(store.readProgress('999').crystals, 0);
    time += 86400000;
    assert.equal(store.claimDaily('1234').reward, 15);
    assert.equal(store.readProgress('1234').streak, 2);
    time += 2 * 86400000;
    const afterSkip = store.claimDaily('1234');
    assert.equal(afterSkip.reward, 10);
    assert.equal(afterSkip.progress.streak, 1);
    assert.equal(afterSkip.progress.crystals, 35);
  } finally {
    store.close();
  }
});

test('Server-selected daily card is stable, unique and isolated per user', () => {
  let time = stamp;
  let generated = 0;
  const store = createStore({ now: () => time, drawCardId: () => generated++ % 22 });
  try {
    const a = store.drawDaily('1234');
    assert.equal(a.isNew, true);
    assert.equal(a.cardId, 0);
    assert.deepEqual(a.progress.arcana, [0]);
    const repeated = store.drawDaily('1234');
    assert.equal(repeated.isNew, false);
    assert.equal(repeated.cardId, 0);
    assert.equal(generated, 1);
    assert.equal(store.drawDaily('2222').cardId, 1);
    assert.deepEqual(store.readProgress('2222').arcana, [1]);
    assert.deepEqual(store.readProgress('1234').arcana, [0]);
    time += 86400000;
    assert.equal(store.drawDaily('1234').cardId, 2);
    assert.deepEqual(store.readProgress('1234').arcana, [0, 2]);
    assert.equal(store.readProgress('1234').missions.dailyCard, true);
  } finally {
    store.close();
  }
});

test('SQLite state survives process restart and concurrent store handles cannot double-credit', () => {
  const folder = mkdtempSync(join(tmpdir(), 'taro-v2-'));
  const filename = join(folder, 'progress.sqlite');
  const one = createStore({ filename, now: () => stamp, drawCardId: () => 12 });
  const two = createStore({ filename, now: () => stamp, drawCardId: () => 20 });
  try {
    assert.equal(one.claimDaily('1234').granted, true);
    assert.equal(two.claimDaily('1234').granted, false);
    assert.equal(two.readProgress('1234').crystals, 10);
    assert.equal(two.drawDaily('1234').cardId, 20);
    assert.equal(one.drawDaily('1234').cardId, 20);
  } finally {
    one.close();
    two.close();
  }
  const restarted = createStore({ filename, now: () => stamp });
  try {
    assert.equal(restarted.readProgress('1234').crystals, 10);
    assert.deepEqual(restarted.readProgress('1234').arcana, [20]);
  } finally {
    restarted.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('HTTP rejects unauthorized/expired users, unapproved origins and client-submitted balances', async () => {
  const store = createStore({ now: () => stamp, drawCardId: () => 4 });
  const server = createApiServer({
    store, secret: SECRET, appId: APP, now: () => stamp,
    allowedOrigins: ['https://example.org']
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, method = 'GET', token = launch(), extra = {}) => fetch(base + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...extra }
  });
  try {
    assert.equal((await request('/health', 'GET', 'bad')).status, 200);
    assert.equal((await request('/api/v1/progress', 'GET', 'bad')).status, 401);
    assert.equal((await request('/api/v1/progress', 'GET', launch(), { Origin: 'https://evil.invalid' })).status, 403);
    const accepted = await request('/api/v1/progress', 'GET', launch(), { Origin: 'https://example.org' });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get('access-control-allow-origin'), 'https://example.org');
    assert.equal((await accepted.json()).crystals, 0);

    const bad = await fetch(base + '/api/v1/daily/claim', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + launch(), 'Content-Type': 'application/json' },
      body: '{"crystals":999999}'
    });
    assert.equal(bad.status, 400);
    assert.equal(store.readProgress('1234').crystals, 0);
    const granted = await request('/api/v1/daily/claim', 'POST');
    assert.equal(granted.status, 200);
    assert.equal((await granted.json()).reward, 10);
    const second = await request('/api/v1/daily/claim', 'POST');
    assert.equal((await second.json()).granted, false);
    const draw = await request('/api/v1/daily/draw', 'POST');
    assert.equal((await draw.json()).cardId, 4);
    const another = await request('/api/v1/progress', 'GET', launch({ userId: '6789' }));
    assert.deepEqual((await another.json()).arcana, []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});
