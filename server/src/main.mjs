import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createStore } from './store.mjs';
import { createApiServer } from './http.mjs';
import { readProtectedKey } from './secret.mjs';

const secret = readProtectedKey();
const appId = Number(process.env.VK_APP_ID || 54582199);
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const origins = (process.env.ALLOWED_ORIGINS || '').split(',')
  .map(value => value.trim()).filter(Boolean);
const dbFile = resolve(process.env.DB_PATH || './data/taro-progress.sqlite');

if (!secret || !Number.isInteger(appId) || appId !== 54582199 ||
    !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set VK_PROTECTED_KEY, VK_APP_ID=54582199 and valid PORT');
}
if (!origins.length && host !== '127.0.0.1' && host !== 'localhost') {
  throw new Error('Set ALLOWED_ORIGINS before exposing this server');
}
mkdirSync(dirname(dbFile), { recursive: true });
const store = createStore({ filename: dbFile });
const server = createApiServer({
  store, secret, appId, allowedOrigins: origins
});
server.listen(port, host, () => {
  console.log('Taro server listening on ' + host + ':' + port);
  // Never log VK signed parameters or protected keys.
});
function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
