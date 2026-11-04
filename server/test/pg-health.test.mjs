import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/v2/health.mjs';

if (!process.env.PGTEST_URL) throw new Error('PGTEST_URL required for real health probe test');
process.env.DATABASE_URL = process.env.PGTEST_URL;

function request(method='GET') {
  const res = {
    headers: {},
    setHeader(k,v) { this.headers[k.toLowerCase()] = v; },
    end(body) { this.body = JSON.parse(body); },
    statusCode: 200
  };
  return handler({method}, res).then(() => res);
}

test('health probe tests real SQL connection and isolated schema without exposing secrets', async () => {
  const res = await request();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.service, 'tarot-v2-postgres');
  assert.equal(res.body.ready, true);
  assert.equal(res.body.database, 'connected');
  assert.equal(res.body.rewardsEnabled, false);
  assert.equal(JSON.stringify(res.body).includes('postgresql://'), false);
  assert.equal(JSON.stringify(res.body).includes('password'), false);
  assert.equal(res.headers['cache-control'].includes('s-maxage=30'), true);
});

test('health endpoint does not accept writes', async () => {
  const res=await request('POST');
  assert.equal(res.statusCode,405);
  assert.deepEqual(res.body,{error:'method_not_allowed'});
});

test('without database URL, health fails closed, no fake ready status', async () => {
  const orig=process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const res=await request();
    assert.equal(res.statusCode,503);
    assert.equal(res.body.ready,false);
    assert.equal(res.body.database,'not_configured');
  } finally {
    process.env.DATABASE_URL=orig;
  }
});
