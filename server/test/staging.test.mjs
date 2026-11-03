import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readProtectedKey } from '../src/secret.mjs';
import { backupDatabase } from '../src/backup.mjs';
import { createStore } from '../src/store.mjs';
import { createApiServer } from '../src/http.mjs';
import { validateStaging } from '../../deploy/preflight.mjs';

const APP_ID = 54582199;
const KEY = 'STAGING_TEST_ONLY_A_NOT_REAL_VK_SECRET_123';
const NOW = Date.parse('2026-11-03T12:00:00Z');

function signed(user, ts = Math.floor(NOW / 1000)) {
  const p = new URLSearchParams({
    vk_user_id: user, vk_app_id: String(APP_ID),
    vk_ts: String(ts), vk_platform: 'mobile_web'
  });
  const canonical = new URLSearchParams([...p].sort(([a],[b]) => a.localeCompare(b))).toString();
  p.set('sign', createHmac('sha256', KEY).update(canonical).digest('base64url'));
  return p.toString();
}

test('secret is read from absolute file, without preferring unsafe inline environment values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taro-secret-'));
  const file = join(dir, 'protected-key');
  writeFileSync(file, KEY + '\n', { mode: 0o600 });
  try {
    assert.equal(readProtectedKey({ VK_PROTECTED_KEY_FILE: file }), KEY);
    assert.equal(readProtectedKey({ VK_PROTECTED_KEY: KEY }), KEY);
    assert.throws(() => readProtectedKey({ VK_PROTECTED_KEY: KEY, VK_PROTECTED_KEY_FILE: file }), /either/);
    assert.throws(() => readProtectedKey({ VK_PROTECTED_KEY_FILE: 'relative.txt' }), /absolute/);
    assert.throws(() => readProtectedKey({}), /required/);
    assert.throws(() => readProtectedKey({ VK_PROTECTED_KEY_FILE: '/nonexistent/taro-key' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('staging preflight refuses placeholder hosts, public secrets, and secret inside repo', () => {
  const root = resolve('/tmp/taro-git-staging-fixture');
  const meta = (mode, uid) => ({
    mode, uid, size: 50, isFile: () => true
  });
  const opts = {
    domain: 'pilot.example.net',
    secretPath: '/home/safe/taro-private/vk-key',
    repoRoot: root,
    stat: () => meta(0o100600, 1000)
  };
  assert.equal(validateStaging(opts).secretConfigured, true);
  assert.throws(() => validateStaging({ ...opts, domain: 'pilot.example.invalid' }), /domain/);
  assert.throws(() => validateStaging({ ...opts, domain: 'vk.com' }), /domain/);
  assert.throws(() => validateStaging({ ...opts, secretPath: '/tmp/taro-git-staging-fixture/.env' }), /outside/);
  assert.throws(() => validateStaging({ ...opts, stat: () => meta(0o100644, 1000) }), /chmod 600/);
  assert.throws(() => validateStaging({ ...opts, stat: () => meta(0o100600, 0) }), /UID 1000/);
});

test('online backup preserves committed crystals and arcana without overwriting an existing copy', () => {
  const folder = mkdtempSync(join(tmpdir(), 'taro-sqlite-backup-'));
  const dbFile = join(folder, 'progress.sqlite');
  const backup = join(folder, 'backups', 'archive.sqlite');
  const store = createStore({ filename: dbFile, now: () => NOW, drawCardId: () => 17 });
  try {
    assert.equal(store.claimDaily('5432').reward, 10);
    assert.equal(store.drawDaily('5432').cardId, 17);
    const output = backupDatabase(dbFile, backup);
    assert.ok(output.bytes > 0);
    assert.equal(statSync(backup).mode & 0o777, 0o600);
    assert.throws(() => backupDatabase(dbFile, backup), /refusing to overwrite/);
    const snapshot = new DatabaseSync(backup, { readOnly: true });
    try {
      assert.equal(snapshot.prepare('SELECT crystals FROM account WHERE user_id=?').get('5432').crystals, 10);
      assert.equal(snapshot.prepare('SELECT card_id FROM arcana WHERE user_id=?').get('5432').card_id, 17);
    } finally {
      snapshot.close();
    }
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('signed API enforces a per-user 60-second request quota with 429, then resets', async () => {
  let time = NOW;
  const store = createStore({ now: () => time });
  const app = createApiServer({
    store, secret: KEY, appId: APP_ID, now: () => time,
    allowedOrigins: ['https://pilot.example.net'],
    rateLimitPerMinute: 2
  });
  await new Promise(done => app.listen(0, '127.0.0.1', done));
  const base = 'http://127.0.0.1:' + app.address().port + '/api/v1/progress';
  const req = user => fetch(base, { headers: { Authorization: 'Bearer ' + signed(user) } });
  try {
    assert.equal((await req('1234')).status, 200);
    assert.equal((await req('1234')).status, 200);
    const limited = await req('1234');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal((await req('9999')).status, 200);
    time += 60000;
    assert.equal((await req('1234')).status, 200);
  } finally {
    await new Promise(done => app.close(done));
    store.close();
  }
});
