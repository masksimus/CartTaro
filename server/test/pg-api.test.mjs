import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomInt } from 'node:crypto';
import { handleV2 } from '../src/api-v2-handler.mjs';

if (!process.env.PGTEST_URL) throw new Error('PGTEST_URL required for real API integration tests');
const KEY = 'TEST_ONLY_VK_PROTECTED_KEY_NO_USER_SECRETS';
const PIN = '0123456789abcdef0123456789abcdef';
process.env.VK_PROTECTED_KEY = KEY;
process.env.DATABASE_URL = process.env.PGTEST_URL;
process.env.TARO_V2_WRITES_ENABLED = 'true';
process.env.TARO_V2_TEST_ACCESS_PIN = PIN;

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

async function req(action, {method,auth,origin='https://tests.example.org',url,body,length,testPin=PIN} = {}) {
  const path = action === 'claim' || action === 'draw' ?
    '/api/v2/daily/' + action : '/api/v2/' + action;
  const request = {
    url: url||path,
    method: method||(['claim','draw','access'].includes(action)?'POST':'GET'),
    headers: { host:'tests.example.org', origin,
      ...auth === null ? {} : { authorization: auth || 'Bearer ' + signed() },
      ...testPin === null ? {} : { 'x-taro-test-pin': testPin },
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
  assert.equal(JSON.stringify(response.data).includes(PIN),false);
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
  assert.equal(draw.data.progress.dailyCardId,draw.data.cardId);
  const repeatDraw=await req('draw',{auth:bearer});
  assert.equal(repeatDraw.statusCode,200);
  assert.equal(repeatDraw.data.isNew,false);
  assert.equal(repeatDraw.data.cardId,draw.data.cardId);
  const progress=await req('progress',{auth:bearer});
  assert.equal(progress.statusCode,200);
  assert.equal(progress.data.crystals,10);
  assert.equal(progress.data.totalClaims,1);
  assert.equal(progress.data.arcana.length,1);
  assert.equal(progress.data.dailyCardId,draw.data.cardId);
  assert.equal(progress.data.dailyCardDrawn,true);
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


test('V2 writes remain blocked without the explicit gate, even when Postgres is ready', async () => {
  const previous = process.env.TARO_V2_WRITES_ENABLED;
  process.env.TARO_V2_WRITES_ENABLED = 'false';
  const id=String(randomInt(400000000,499999999));
  const token='Bearer '+signed(id);
  try {
    const status=await req('status',{auth:null});
    assert.equal(status.statusCode,200);
    assert.equal(status.data.storageConfigured,true);
    assert.equal(status.data.rewardsEnabled,false);
    const claim=await req('claim',{auth:token});
    const draw=await req('draw',{auth:token});
    assert.equal(claim.statusCode,503);
    assert.deepEqual(claim.data,{error:'rewards_disabled'});
    assert.equal(draw.statusCode,503);
    assert.deepEqual(draw.data,{error:'rewards_disabled'});
    const progress=await req('progress',{auth:token});
    assert.equal(progress.statusCode,200);
    assert.equal(progress.data.crystals,0);
    assert.equal(progress.data.dailyCardId,null);
  } finally {
    if(previous===undefined)delete process.env.TARO_V2_WRITES_ENABLED;
    else process.env.TARO_V2_WRITES_ENABLED=previous;
  }
});


test('pilot PIN allows non-mutating access check for signed VK launch only', async () => {
  const good=await req('access');
  assert.equal(good.statusCode,200);
  assert.deepEqual(good.data,{authorized:true});
  const noPin=await req('access',{testPin:null});
  assert.equal(noPin.statusCode,403);
  const wrong=await req('access',{testPin:'f'.repeat(32)});
  assert.equal(wrong.statusCode,403);
  const invalidHmac=await req('access',{auth:'Bearer forged'});
  assert.equal(invalidHmac.statusCode,401);
});

test('wrong or absent tester PIN never grants any balance or card in PostgreSQL', async () => {
  const id=String(randomInt(500000000,599999999));
  const auth='Bearer '+signed(id);
  for(const testPin of [null,'0'.repeat(32),'invalid']) {
    for(const action of ['claim','draw']) {
      const result=await req(action,{auth,testPin});
      assert.equal(result.statusCode,403);
      assert.deepEqual(result.data,{error:'test_access_denied'});
    }
  }
  const progress=await req('progress',{auth,testPin:null});
  assert.equal(progress.statusCode,200);
  assert.equal(progress.data.crystals,0);
  assert.equal(progress.data.dailyCardDrawn,false);
  assert.deepEqual(progress.data.arcana,[]);
});

test('writes remain disabled if developer PIN configuration is absent', async () => {
  const prior=process.env.TARO_V2_TEST_ACCESS_PIN;
  delete process.env.TARO_V2_TEST_ACCESS_PIN;
  try {
    const state=await req('status',{auth:null,testPin:null});
    assert.equal(state.data.rewardsEnabled,false);
    assert.equal(state.data.mode,'read_only');
    const response=await req('claim');
    assert.equal(response.statusCode,503);
    assert.equal(response.data.error,'rewards_disabled');
  } finally {
    process.env.TARO_V2_TEST_ACCESS_PIN=prior;
  }
});


test('signed free tarot spreads are server-randomized and NEVER change existing daily economy', async () => {
  const id=String(randomInt(600000000,699999999));
  const auth='Bearer '+signed(id);
  const before=await req('progress',{auth,testPin:null});
  assert.equal(before.statusCode,200);
  assert.equal(before.data.crystals,0);
  assert.equal(before.data.dailyCardId,null);
  const one=await req('spreadOne',{url:'/api/v2/spreads/one',auth,testPin:null});
  const three=await req('spreadThree',{url:'/api/v2/spreads/three',auth,testPin:null});
  assert.equal(one.statusCode,200);
  assert.equal(three.statusCode,200);
  assert.equal(one.data.kind,'one');
  assert.equal(one.data.cards.length,1);
  assert.equal(three.data.kind,'three');
  assert.equal(three.data.cards.length,3);
  assert.equal(new Set(three.data.cards.map(x=>x.id)).size,3);
  assert.ok(one.data.cards.every(x=>x.meaning&&x.advice));
  assert.equal(Object.hasOwn(one.data,'userId'),false);
  assert.equal(Object.hasOwn(three.data,'crystals'),false);
  const after=await req('progress',{auth,testPin:null});
  assert.deepEqual(after.data,before.data);
});
test('spreads fail closed on invalid HMAC/expired session/wrong origin and method',async()=>{
  const variants=[
    [req('spreadOne',{url:'/api/v2/spreads/one',auth:null,testPin:null}),401],
    [req('spreadOne',{url:'/api/v2/spreads/one',auth:'Bearer forged',testPin:null}),401],
    [req('spreadThree',{url:'/api/v2/spreads/three',auth:'Bearer '+signed('5556',Math.floor(Date.now()/1000)-3600)}),401],
    [req('spreadThree',{url:'/api/v2/spreads/three',origin:'https://other.example.net'}),403],
    [req('spreadThree',{url:'/api/v2/spreads/three',method:'POST'}),405],
    [req('spreadOne',{url:'/api/v2/spreads/one?client_card=21'}),400]
  ];
  for(const [r,expected] of variants)assert.equal((await r).statusCode,expected);
});
