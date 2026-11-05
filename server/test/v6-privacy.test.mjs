import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomInt } from 'node:crypto';
import pg from 'pg';
import { handleV2 } from '../src/api-v2-handler.mjs';
if(!process.env.PGTEST_V5_URL)throw Error('PGTEST_V5_URL required for real privacy tests');
const secret='V6_PRIVACY_TEST_ONLY_NOT_A_REAL_KEY';
Object.assign(process.env,{VK_PROTECTED_KEY:secret,DATABASE_URL:process.env.PGTEST_URL,TARO_V5_DATABASE_URL:process.env.PGTEST_V5_URL,TARO_V2_PUBLIC_GAME_ENABLED:'true',TARO_V2_WRITES_ENABLED:'false',TARO_V5_PUBLIC_RELEASE_CONFIRMED:'false',VERCEL_ENV:'production'});
function signed(id){const p=new URLSearchParams({vk_app_id:'54582199',vk_ts:String(Math.floor(Date.now()/1000)),vk_user_id:id});p.sort();p.set('sign',createHmac('sha256',secret).update(p.toString()).digest('base64url'));return p.toString();}
async function req(token,{method='POST',body,origin='https://test.example',url='/api/v2/privacy/deletion-request'}={}){const r={headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){this.data=JSON.parse(raw);}};await handleV2({url,method,body,headers:{host:'test.example',origin,...token?{authorization:'Bearer '+token}:{}}},r,'deletionRequest');return r;}
test('signed deletion request is idempotent and queues without deleting progress or enabling rewards',async()=>{
  const id=String(randomInt(10000000,99999999)),token=signed(id),pool=new pg.Pool({connectionString:process.env.PGTEST_V5_URL});
  try{
    const [a,b]=await Promise.all([req(token),req(token)]);assert.equal(a.statusCode,202);assert.equal(b.statusCode,202);assert.deepEqual(a.data,{status:'pending'});
    const rows=await pool.query('SELECT count(*)::int AS n FROM tarot_v6_deletion_requests WHERE user_id=$1',[id]);assert.equal(rows.rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM tarot_v2_accounts WHERE user_id=$1',[id])).rows[0].n,0);
    assert.equal(process.env.TARO_V2_WRITES_ENABLED,'false');
    const other=new pg.Pool({connectionString:process.env.PGTEST_URL});try{const table=await other.query("SELECT to_regclass('tarot_v6_deletion_requests') AS name");assert.equal(table.rows[0].name,null);}finally{await other.end();}
  }finally{await pool.end();}
});
test('privacy endpoint rejects unsigned, forged, query, body, wrong method and foreign origin',async()=>{
  const token=signed('88888888');
  const cases=[[null,{},401],[token.replace('88888888','77777777'),{},401],[token,{method:'GET'},405],[token,{body:{user_id:'77777777'}},400],[token,{origin:'https://evil.example'},403],[token,{url:'/api/v2/privacy/deletion-request?user=1'},400]];
  for(const [s,o,code] of cases)assert.equal((await req(s,o)).statusCode,code);
});
