import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARCANA, TOPICS } from '../../v6/content.mjs';
import { emptyDemo, openDemo, demoProgress, dailyId, demoSpread, interpretation, parseLaunch, validProgress, validSpread, loadDemo } from '../../v6/game.mjs';

test('demo daily reveal is idempotent, resets at UTC midnight, and accrues no rewards',()=>{
  let data=openDemo(emptyDemo(),'2026-11-05');
  assert.deepEqual(openDemo(data,'2026-11-05'),data);
  assert.equal(demoProgress(data,'2026-11-05').dailyCardId,dailyId('2026-11-05'));
  assert.equal(demoProgress(data,'2026-11-06').dailyCardId,null);
  data=openDemo(data,'2026-11-06');
  assert.equal(demoProgress(data,'2026-11-06').streak,2);
  assert.equal(demoProgress(data,'2026-11-06').crystals,0);
  assert.equal(demoProgress(data,'2026-11-08').streak,0);
  assert.equal(demoProgress(openDemo(data,'2026-11-09'),'2026-11-09').streak,1);
  assert.equal(new Set(Array.from({length:22},(_,i)=>dailyId(`2026-11-${String(i+1).padStart(2,'0')}`))).size,22);
});
test('corrupt or unavailable browser storage cannot prevent startup',()=>{
  assert.deepEqual(loadDemo({getItem:()=>'{broken'}),emptyDemo());
  assert.deepEqual(loadDemo({getItem:()=>{throw Error('blocked');}}),emptyDemo());
  const data=loadDemo({getItem:()=>JSON.stringify({version:1,arcana:[1,1,-1,22,'2'],dates:['invalid','2026-11-05','2026-11-05'],saved:[]})});
  assert.deepEqual(data.arcana,[1]);assert.deepEqual(data.dates,['2026-11-05']);
});
test('all 22 cards have local original art and four distinct topic prompts',async()=>{
  assert.equal(ARCANA.length,22);assert.equal(TOPICS.length,4);
  const prompts=new Set();
  for(const c of ARCANA){
    const art=await readFile(new URL(`../../v6/assets/cards/${c.id}.svg`,import.meta.url),'utf8');
    assert.match(art,/<svg/);assert.doesNotMatch(art,/<script|<image|href=/);
    for(const t of TOPICS){const text=interpretation(c.id,t.id);assert.ok(text.prompt.length>20);prompts.add(text.prompt);}
  }
  assert.equal(prompts.size,88);
});
test('one/three demo spreads have unique valid cards and reject other sizes',()=>{
  for(const n of [1,3]){const spread=demoSpread(n,()=>0);assert.equal(validSpread(spread,n),true);assert.equal(new Set(spread.cards.map(c=>c.id)).size,n);}
  assert.throws(()=>demoSpread(22));assert.equal(validSpread({kind:'three',cards:[{id:1},{id:1},{id:1}]},3),false);
});
test('launch parsing strips unrelated fields and rejects ambiguous credentials',()=>{
  const s='vk_app_id=54582199&vk_user_id=123&vk_ts=1793865600&sign='+'a'.repeat(43);
  assert.equal(parseLaunch(s+'&redirect=https://evil.example'),s);
  assert.equal(parseLaunch(s+'&vk_user_id=456'),null);
  assert.equal(parseLaunch(s+'&sign='+'b'.repeat(43)),null);
  assert.equal(parseLaunch('vk_user_id=123'),null);
  assert.equal(parseLaunch(s.replace('54582199','1')),null);
});
test('remote state is validated instead of accepting impossible balances or cards',()=>{
  const p=demoProgress(emptyDemo(),'2026-11-05');assert.equal(validProgress(p),true);
  for(const patch of [{crystals:-1},{arcana:[22]},{arcana:[1,1]},{dailyCardId:1},{streak:'99'},{dayUtc:'bad'}])assert.equal(validProgress({...p,...patch}),false);
});
