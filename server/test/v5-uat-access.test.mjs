import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleV2} from '../src/api-v2-handler.mjs';
import {storageConfigured} from '../src/pg-service.mjs';

const SECRET='TARO_UAT_FIXTURE_NEVER_USE_OUTSIDE_CI';
const allowed='123456789';
const other='234567890';
function sign(userId) {
  const p=new URLSearchParams({
    vk_app_id:'54582199',vk_user_id:userId,
    vk_platform:'mobile_web',vk_ts:String(Math.floor(Date.now()/1000))
  });
  const canonical=new URLSearchParams([...p.entries()].sort(([a],[b])=>a.localeCompare(b))).toString();
  p.set('sign',createHmac('sha256',SECRET).update(canonical).digest('base64url'));
  return p.toString();
}
async function call(action,method,launch) {
  const pathname=action==='progress'?'/api/v2/progress':action==='claim'?'/api/v2/daily/claim':'/api/v2/status';
  const req={method,url:pathname,headers:{host:'localhost',
    ...(launch?{authorization:'Bearer '+launch}:{})}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},
    end(data){this.json=JSON.parse(data);return this;}};
  await handleV2(req,res,action);
  return {status:res.statusCode,data:res.json};
}
const defaults={
  VERCEL_ENV:process.env.VERCEL_ENV,
  VK_PROTECTED_KEY:process.env.VK_PROTECTED_KEY,
  TARO_V2_PUBLIC_GAME_ENABLED:process.env.TARO_V2_PUBLIC_GAME_ENABLED,
  TARO_V2_WRITES_ENABLED:process.env.TARO_V2_WRITES_ENABLED,
  TARO_V2_TEST_ACCESS_PIN:process.env.TARO_V2_TEST_ACCESS_PIN,
  TARO_V5_UAT_USER_IDS:process.env.TARO_V5_UAT_USER_IDS,
  TARO_V5_UAT_MODE:process.env.TARO_V5_UAT_MODE,
  TARO_V5_DATABASE_URL:process.env.TARO_V5_DATABASE_URL
};
test('V5 Preview access is explicitly allowlisted, signed and fail-closed',async()=>{
  try {
    process.env.VERCEL_ENV='preview';
    process.env.VK_PROTECTED_KEY=SECRET;
    process.env.TARO_V2_PUBLIC_GAME_ENABLED='true';
    process.env.TARO_V2_WRITES_ENABLED='true';
    delete process.env.TARO_V2_TEST_ACCESS_PIN;
    process.env.TARO_V5_DATABASE_URL=process.env.PGTEST_V5_URL;
    assert.equal(storageConfigured(process.env,{publicGame:true}),true);

    delete process.env.TARO_V5_UAT_MODE;
    delete process.env.TARO_V5_UAT_USER_IDS;
    assert.deepEqual(await call('status','GET'),{status:200,data:{
      service:'tarot-v2-postgres',appId:54582199,storageConfigured:true,
      rewardsEnabled:false,mode:'read_only'
    }});
    assert.equal((await call('progress','GET',sign(allowed))).status,503);

    process.env.TARO_V5_UAT_MODE='true';
    process.env.TARO_V5_UAT_USER_IDS=allowed;
    assert.equal((await call('progress','GET',sign(other))).status,403);
    assert.equal((await call('progress','GET',sign(allowed)+'corrupt')).status,401);
    assert.equal((await call('progress','GET')).status,401);

    const permitted=await call('progress','GET',sign(allowed));
    assert.equal(permitted.status,200);
    assert.equal(permitted.data.crystals,0);
    assert.deepEqual(permitted.data.arcana,[]);

    assert.equal((await call('claim','POST',sign(other))).status,403);
    const first=await call('claim','POST',sign(allowed));
    assert.equal(first.status,200);
    assert.equal(first.data.granted,true);
    const repeat=await call('claim','POST',sign(allowed));
    assert.equal(repeat.status,200);
    assert.equal(repeat.data.granted,false);
    assert.equal(repeat.data.progress.crystals,10);
  } finally {
    for(const [key,value] of Object.entries(defaults)) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
