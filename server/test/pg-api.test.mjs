import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomInt } from 'node:crypto';
import { handleV2 } from '../src/api-v2-handler.mjs';

if (!process.env.PGTEST_URL) throw new Error('PGTEST_URL required for real API integration tests');
const KEY = 'TEST_ONLY_VK_PROTECTED_KEY_NO_USER_SECRETS';
process.env.VK_PROTECTED_KEY = KEY;
process.env.DATABASE_URL = process.env.PGTEST_URL;

function signed(userId = '1234567', ts = Math.floor(Date.now()/1000)) {
  const values = new URLSearchParams({
    vk_app_id: '54582199', vk_user_id: userId, vk_ts: String(ts),
    vk_platform: 'mobile_web'
  });
  const canonical = new URLSearchParams([...values].sort((a,b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  values.set('sign', createHmac('sha256',KEY).update(canonical.toString()).digest('base64url'));
  return values.toString();
}

async function req(action, {method,auth,origin='https://tests.example.org',url,body,length} = {}) {
  const path = action === 'claim' || action === 'draw' ?
    '/api/v2/daily/' + action : '/api/v2/' + action;
  const request = {
    url: url||path,
    method: method||(['claim','draw'].includes(action)?'POST':'GET'),
    headers: { host:'tests.example.org', origin,
      ...auth === null ? {} : { authorization: auth || 'Bearer ' + signed() },
      ...length !== undefined ? {'content-length':length}: {} },
    body
  };
  const res={
    statusCode:200,headers:{},
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    end(raw){this.data=JSON.parse(raw);}
  };
  await handleV2(request,res,action);
  return res;
}

test('the public status emits no secret, user IDs or database URL', async () => {
  const response=await req('status',{auth:null});
  assert.equal(response.statusCode,200);
  assert.equal(response.data.storageConfigured,true);
  assert.equal(response.data.mode,'developer_pilot');
  assert.equal(JSON.stringify(response.data).includes(KEY),false);
  assert.equal(JSON.stringify(response.data).includes('postgres://'),false);
});

test('real HMAC + Postgres API only grants one reward and one card per day', async () => {
  const id=String(randomInt(300000000,399999999));
  const bearer='Bearer '+signed(id);
  const claim=await req('claim',{auth:bearer});
  assert.equal(claim.statusCode,200);
  assert.equal(claim.data.granted,true);
  assert.equal(claim.data.reward,10);
  const repeat=await req('claim',{auth:bearer});
  assert.equal(repeat.statusCode,200);
  assert.equal(repeat.data.granted,false);
  assert.equal(repeat.data.reward,0);
  const draw=await req('draw',{auth:bearer});
  assert.equal(draw.statusCode,200);
  assert.equal(draw.data.isNew,true);
  const repeatDraw=await req('draw',{auth:bearer});
  assert.equal(repeatDraw.statusCode,200);
  assert.equal(repeatDraw.data.isNew,false);
  assert.equal(repeatDraw.data.cardId,draw.data.cardId);
  const progress=await req('progress',{auth:bearer});
  assert.equal(progress.statusCode,200);
  assert.equal(progress.data.crystals,10);
  assert.equal(progress.data.totalClaims,1);
  assert.equal(progress.data.arcana.length,1);
  assert.equal(progress.data.dayUtc,new Date().toISOString().slice(0,10));
});

test('forged, wrong-origin, query, body and unsigned API access denied', async () => {
  const invalid=[
    [req('claim',{auth:null}),401],
    [req('claim',{auth:'Bearer invalid'}),401],
    [req('claim',{auth:'Bearer '+signed('12345',Math.floor(Date.now()/1000)-3600)}),401],
    [req('claim',{origin:'https://outsider.example.org'}),403],
    [req('claim',{url:'/api/v2/daily/claim?crystals=999'}),400],
    [req('claim',{length:'29'}),400],
    [req('claim',{body:{crystals:99999}}),400],
    [req('progress',{method:'POST'}),405]
  ];
  const all=await Promise.all(invalid.map(async ([r,c])=>[await r,c]));
  for(const [response,code] of all)assert.equal(response.statusCode,code);
});
