import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomInt} from 'node:crypto';
import {verifyVkLaunch} from '../src/auth.mjs';
import {handleV2} from '../src/api-v2-handler.mjs';

const SIGNING_KEY='TEST_PROXY_SIGNING_KEY_DO_NOT_USE_OUTSIDE_CI';
function signed(userId) {
  const p=new URLSearchParams({vk_app_id:'54582199',vk_user_id:userId,
    vk_platform:'mobile_web',vk_ts:String(Math.floor(Date.now()/1000))});
  p.set('sign',createHmac('sha256',SIGNING_KEY)
    .update(new URLSearchParams([...p.entries()].sort(([a],[b])=>a.localeCompare(b))).toString())
    .digest('base64url'));
  return p.toString();
}
async function call(action,launch) {
  const url=action==='progress'?'/api/v2/progress':'/api/v2/daily/claim';
  const req={url,method:action==='progress'?'GET':'POST',headers:{
    host:'localhost',...(launch?{authorization:'Bearer '+launch}:{})
  }};
  const res={statusCode:200,setHeader(){},end(text){this.body=JSON.parse(text);return this;}};
  await handleV2(req,res,action);
  return {status:res.statusCode,body:res.body};
}
test('V5 UAT delegates only signed launch to fixed read-only V4 verifier',async()=>{
  const keys=['VERCEL_ENV','VK_PROTECTED_KEY','TARO_V2_PUBLIC_GAME_ENABLED',
    'TARO_V2_WRITES_ENABLED','TARO_V2_TEST_ACCESS_PIN','TARO_V5_UAT_MODE',
    'TARO_V5_UAT_USER_IDS','TARO_V5_DATABASE_URL'];
  const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const savedFetch=globalThis.fetch;
  const tester=String(randomInt(1000000000,9000000000));
  const outsider=String(randomInt(1000000000,9000000000));
  let remoteReads=0;
  try {
    Object.assign(process.env,{
      VERCEL_ENV:'preview',TARO_V2_PUBLIC_GAME_ENABLED:'true',
      TARO_V2_WRITES_ENABLED:'false',TARO_V5_UAT_MODE:'true',
      TARO_V5_UAT_USER_IDS:tester,TARO_V5_DATABASE_URL:process.env.PGTEST_V5_URL
    });
    delete process.env.VK_PROTECTED_KEY;
    delete process.env.TARO_V2_TEST_ACCESS_PIN;
    globalThis.fetch=async (url,options)=>{
      assert.equal(url,'https://tarot-vk-uat-public-2026.vercel.app/api/v2/progress');
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'error');
      remoteReads+=1;
      try{
        verifyVkLaunch(options.headers.Authorization.slice(7),
          {secret:SIGNING_KEY,appId:54582199});
        return {status:200};
      }catch{return {status:401};}
    };
    assert.equal((await call('progress')).status,401);
    assert.equal((await call('progress',signed(tester)+'tampered')).status,401);
    assert.equal((await call('progress',signed(outsider))).status,403);
    const r=await call('progress',signed(tester));
    assert.equal(r.status,200);
    assert.equal(r.body.crystals,0);
    assert.deepEqual(r.body.arcana,[]);
    assert.equal((await call('claim',signed(tester))).status,503);
    assert.equal(remoteReads,4);
    globalThis.fetch=async()=>({status:503});
    assert.equal((await call('progress',signed(tester))).status,503);
    assert.equal((await call('progress',signed(tester).replace('vk_app_id','bad_app_id'))).status,401);
    process.env.VERCEL_ENV='production';
    assert.equal((await call('progress',signed(tester))).status,503);
  }finally{
    globalThis.fetch=savedFetch;
    for(const k of keys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
  }
});
