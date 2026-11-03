import { createHmac, timingSafeEqual } from 'node:crypto';

export class AuthError extends Error {
  constructor(message = 'Invalid VK launch parameters') {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verify VK Mini Apps launch parameters with the server-only protected key.
 * Reference: VKCOM/vk-apps-launch-params (official algorithm).
 * Never log or put raw signed launch params into URLs.
 */
export function verifyVkLaunch(raw, { secret, appId, nowMs = Date.now(), ttlSeconds = 900 } = {}) {
  if (typeof raw !== 'string' || raw.length < 20 || raw.length > 8192 ||
      raw.includes('\n') || raw.includes('\r') || !secret ||
      !Number.isSafeInteger(Number(appId))) throw new AuthError();

  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  const vkEntries = [];
  const seen = new Set();
  let signature = '';
  for (const [key, value] of params) {
    if (key === 'sign') {
      if (signature || !value) throw new AuthError();
      signature = value;
    } else if (key.startsWith('vk_')) {
      if (seen.has(key)) throw new AuthError();
      seen.add(key);
      vkEntries.push([key, value]);
    }
  }
  if (!signature || !vkEntries.length || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    throw new AuthError();
  }

  vkEntries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const canonical = new URLSearchParams(vkEntries).toString();
  const expected = createHmac('sha256', secret).update(canonical).digest('base64url');
  const receivedBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (receivedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(receivedBytes, expectedBytes)) throw new AuthError();

  const data = Object.fromEntries(vkEntries);
  if (data.vk_app_id !== String(appId) ||
      !/^[1-9]\d{0,15}$/.test(data.vk_user_id || '') ||
      !/^\d{9,12}$/.test(data.vk_ts || '')) throw new AuthError();

  const tsMs = Number(data.vk_ts) * 1000;
  if (!Number.isFinite(tsMs) || !Number.isFinite(nowMs) ||
      nowMs - tsMs > ttlSeconds * 1000 || tsMs - nowMs > 60000) {
    throw new AuthError('Expired VK launch parameters');
  }
  return Object.freeze({ userId: data.vk_user_id, appId: Number(data.vk_app_id) });
}
