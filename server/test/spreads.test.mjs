import test from 'node:test';
import assert from 'node:assert/strict';
import { MAJOR_ARCANA, createSpread } from '../src/spreads.mjs';

test('exactly 22 unique original major arcana with bounded text fields', () => {
  assert.equal(MAJOR_ARCANA.length,22);
  assert.deepEqual(MAJOR_ARCANA.map(c=>c.id),Array.from({length:22},(_,i)=>i));
  assert.equal(new Set(MAJOR_ARCANA.map(c=>c.name)).size,22);
  for(const c of MAJOR_ARCANA){
    assert.ok(c.title.length && c.light.length && c.shadow.length && c.advice.length);
    assert.ok(c.sigil.length <= 3);
  }
});
test('one-card reading contains a reflection, not account balance or tokens', () => {
  const s=createSpread(1,{integer:()=>0,now:()=>Date.UTC(2026,10,4)});
  assert.equal(s.kind,'one');
  assert.equal(s.cards.length,1);
  assert.equal(s.cards[0].id,0);
  assert.equal(s.cards[0].position,'Главная тема');
  assert.equal(s.cards[0].reversed,true);
  assert.ok(s.cards[0].meaning.includes('Спешка'));
  assert.equal(s.generatedAt,'2026-11-04T00:00:00.000Z');
  assert.equal(Object.hasOwn(s,'crystals'),false);
  assert.equal(Object.hasOwn(s,'userId'),false);
});
test('three cards are unique even when random generator chooses index zero', () => {
  const cards=createSpread(3,{integer:()=>0}).cards;
  assert.deepEqual(cards.map(c=>c.id),[0,1,2]);
  assert.equal(cards.length,3);
  assert.equal(new Set(cards.map(c=>c.id)).size,3);
  assert.deepEqual(cards.map(c=>c.position),[
    'Что было','Что происходит','Куда направить внимание'
  ]);
});
test('inverted and upright interpretations differ, advice remains thoughtful', () => {
  const upright=createSpread(1,{integer: n => n===4?1:8});
  assert.equal(upright.cards[0].reversed,false);
  assert.equal(upright.cards[0].meaning,MAJOR_ARCANA[8].light);
  const inverted=createSpread(1,{integer: n => n===4?0:8});
  assert.equal(inverted.cards[0].reversed,true);
  assert.equal(inverted.cards[0].meaning,MAJOR_ARCANA[8].shadow);
});
test('unsupported counts and malformed random output fail closed', () => {
  for(const n of [0,2,4,22,-1,undefined]) {
    assert.throws(()=>createSpread(n),TypeError);
  }
  assert.throws(()=>createSpread(1,{integer:()=>NaN}),/Invalid entropy/);
  assert.throws(()=>createSpread(3,{integer:()=>22}),/Invalid entropy/);
});
test('real crypto randomizer returns valid unique cards across repeated sessions',()=>{
  for(let i=0;i<100;i++){
    const r=createSpread(3);
    assert.equal(r.cards.length,3);
    assert.equal(new Set(r.cards.map(c=>c.id)).size,3);
    assert.ok(r.cards.every(c=>typeof c.advice==='string'));
  }
});
