/**
 * Public read-only status for the isolated VK authentication probe.
 * Never emits secrets, accounts, VK launch tokens or database details.
 */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'method_not_allowed' }));
  }
  res.statusCode = 200;
  return res.end(JSON.stringify({
    service: 'tarot-vk-auth-probe',
    appId: 54582199,
    configured: typeof process.env.VK_PROTECTED_KEY === 'string' &&
      process.env.VK_PROTECTED_KEY.length >= 16,
    persistentStorageConnected: false,
    rewardsEnabled: false,
    mode: 'read_only'
  }));
}
