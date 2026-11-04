/* CI-only HTTP wrapper for the same Vercel handlers, real local Postgres.
 * Guarded so it cannot become a publicly exposed game server. */
import { createServer } from 'node:http';
import { handleV2 } from '../src/api-v2-handler.mjs';

if (process.env.NODE_ENV !== 'test' || !process.env.PGTEST_URL ||
    process.env.DATABASE_URL !== process.env.PGTEST_URL ||
    process.env.HOST !== '127.0.0.1') {
  throw new Error('CI-only fixture: requires test Postgres and loopback');
}

const mapping = {
  'GET /api/v2/progress': 'progress',
  'POST /api/v2/daily/claim': 'claim',
  'POST /api/v2/daily/draw': 'draw',
  'GET /api/v2/status': 'status'
};
const port = Number(process.env.PORT || 8788);
createServer(async (req,res) => {
  const u=new URL(req.url,'http://localhost');
  const action=mapping[req.method+' '+u.pathname];
  if (!action) {
    res.writeHead(404,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({error:'not_found'}));
  }
  await handleV2(req,res,action);
}).listen(port,'127.0.0.1',() => {
  console.log('Local-only PostgreSQL V2 E2E fixture on '+port);
});
