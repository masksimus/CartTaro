import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import handler from '../../api/vk/verify.mjs';
import statusHandler from '../../api/vk/status.mjs';

const KEY = 'TEST_ONLY_VK_PROTECTED_KEY_FIXTURE_DO_NOT_USE';
const APP_ID = '54582199';
const url = '/api/vk/verify';

function signedLaunch({ userId = '12345', appId = APP_ID, ts = Math.floor(Date.now() / 1000) } = {}) {
  const p = new URLSearchParams({
    vk_app_id: appId, vk_user_id: userId, vk_ts: String(ts), vk_platform: 'mobile_web'
  });
  const sorted = new URLSearchParams([...p].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  p.set('sign', createHmac('sha256', KEY).update(sorted.toString()).digest('base64url'));
  return p.toString();
}

async function request(path, {
  method = 'POST', authorization,
  origin = 'https://test.example.org',
  host = 'test.example.org',
  body,
  length,
  transferEncoding
} = {}) {
  const headers = { host };
  if (origin !== null) headers.origin = origin;
  if (authorization !== undefined) headers.authorization = authorization;
  if (length !== undefined) headers['content-length'] = length;
  if (transferEncoding !== undefined) headers['transfer-encoding'] = transferEncoding;
  const req = { url: path, method, headers, body };
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(value) { this.value = JSON.parse(value); }
  };
  await (path === '/api/vk/status' ? statusHandler(req, res) : handler(req, res));
  return res;
}

test('readiness reports missing server key without exposing any secrets', async () => {
  const prior = process.env.VK_PROTECTED_KEY;
  delete process.env.VK_PROTECTED_KEY;
  try {
    const response = await request('/api/vk/status', { method: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.value.configured, false);
    assert.equal(response.value.persistentStorageConnected, false);
    assert.equal(response.value.rewardsEnabled, false);
    assert.equal(response.headers['cache-control'].startsWith('no-store'), true);
    assert.equal(JSON.stringify(response.value).includes('secret'), false);
    const rejected = await request(url, { authorization: 'Bearer ' + signedLaunch() });
    assert.equal(rejected.statusCode, 503);
    assert.deepEqual(rejected.value, { error: 'auth_not_configured' });
    assert.equal((await request('/api/vk/status', { method: 'POST' })).statusCode, 405);
  } finally {
    if (prior === undefined) delete process.env.VK_PROTECTED_KEY;
    else process.env.VK_PROTECTED_KEY = prior;
  }
});

test('valid signed VK launch is accepted without returning user ID or raw token', async () => {
  process.env.VK_PROTECTED_KEY = KEY;
  const launch = signedLaunch();
  const response = await request(url, { authorization: 'Bearer ' + launch });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.value, { verified: true, appId: 54582199 });
  assert.equal(response.headers['cache-control'].startsWith('no-store'), true);
  assert.equal(JSON.stringify(response.value).includes('12345'), false);
  assert.equal(JSON.stringify(response.value).includes(launch), false);
});

test('cannot bypass HMAC by changing user ID, app ID or timestamp', async () => {
  process.env.VK_PROTECTED_KEY = KEY;
  const original = signedLaunch();
  const checks = [
    original.replace('vk_user_id=12345', 'vk_user_id=99999'),
    signedLaunch({ appId: '11111111' }),
    signedLaunch({ ts: Math.floor(Date.now() / 1000) - 7200 }),
    signedLaunch() + '&vk_ts=1111111111',
    'vk_app_id=54582199&vk_user_id=12345&vk_ts=1793769000&sign=INVALID'
  ];
  for (const payload of checks) {
    const response = await request(url, { authorization: 'Bearer ' + payload });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.value, { error: 'unauthorized' });
  }
});

test('no query, body or cross-origin browser calls to signed endpoint', async () => {
  process.env.VK_PROTECTED_KEY = KEY;
  const token = 'Bearer ' + signedLaunch();
  const cases = [
    [{ method: 'GET', authorization: token }, 405],
    [{ authorization: token, origin: 'https://attacker.example.org' }, 403],
    [{ authorization: token, origin: 'http://test.example.org' }, 403],
    [{ authorization: token, body: { crystals: 9999 } }, 400],
    [{ authorization: token, length: '4' }, 400],
    [{ authorization: token, transferEncoding: 'chunked' }, 400],
    [{ authorization: '' }, 401],
  ];
  for (const [options, expected] of cases) {
    assert.equal((await request(url, options)).statusCode, expected);
  }
  assert.equal((await request(url + '?token=SECRETS', { authorization: token })).statusCode, 400);
  assert.equal((await request(url, { authorization: token, origin: null })).statusCode, 200);
});

test('public readiness never includes user progress and is accurate when configured', async () => {
  process.env.VK_PROTECTED_KEY = KEY;
  const result = await request('/api/vk/status', { method: 'GET' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.value.configured, true);
  assert.equal(result.value.mode, 'read_only');
  assert.equal(result.value.persistentStorageConnected, false);
  assert.equal(result.value.rewardsEnabled, false);
  assert.equal(JSON.stringify(result.value).includes(KEY), false);
});
