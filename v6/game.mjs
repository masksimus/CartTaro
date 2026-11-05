import { ARCANA, TOPICS } from './content.mjs';
export const DEMO_KEY = 'arcana.v6.demo';
export const dayUTC = (now=Date.now()) => new Date(now).toISOString().slice(0,10);
export const validId = id => Number.isInteger(id) && id >= 0 && id < 22;
export function dailyId(day) {
  // Stable across reloads; deliberately NOT a server reward/randomness source.
  return ((Math.floor(Date.parse(day+'T00:00:00Z')/86400000) % 22)+22)%22;
}
export function loadDemo(storage) {
  try {
    const data = JSON.parse(storage.getItem(DEMO_KEY));
    if (!data || data.version !== 1) return emptyDemo();
    const dates = Array.isArray(data.dates) ? [...new Set(data.dates.filter(d=>typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d))))].sort().slice(-366) : [];
    return {version:1,dates,arcana:Array.isArray(data.arcana)?[...new Set(data.arcana.filter(validId))]:[],saved:Array.isArray(data.saved)?data.saved.filter(x=>x && validId(x.id) && dates.includes(x.day)).slice(-30):[]};
  } catch { return emptyDemo(); }
}
export const emptyDemo = () => ({version:1,dates:[],arcana:[],saved:[]});
export function demoProgress(data,day=dayUTC()) {
  const opened = data.dates.includes(day);
  let streak=0, cursor=Date.parse(day+'T00:00:00Z');
  if(!opened)cursor-=86400000;
  while(data.dates.includes(dayUTC(cursor))){streak++;cursor-=86400000;}
  return {dayUtc:day,dailyCardId:opened?dailyId(day):null,dailyCardDrawn:opened,arcana:data.arcana,streak,crystals:0,claimedToday:false};
}
export function openDemo(data,day=dayUTC()) {
  const id=dailyId(day);
  return {...data,dates:[...new Set([...data.dates,day])].sort().slice(-366),arcana:[...new Set([...data.arcana,id])]};
}
export function demoSpread(count,integer = max => crypto.getRandomValues(new Uint32Array(1))[0]%max) {
  if(count!==1 && count!==3)throw Error('spread_size');
  const bag=ARCANA.map(x=>x.id);
  return {kind:count===1?'one':'three',cards:Array.from({length:count},(_,i)=>{
    const id=bag.splice(integer(bag.length),1)[0];
    const reversed=integer(4)===0;
    return {...ARCANA[id],reversed,meaning:reversed?ARCANA[id].shadow:ARCANA[id].light,position:count===1?'Главная тема':['Опыт','Сейчас','Следующий шаг'][i]};
  })};
}
export function interpretation(id,topic,reversed=false) {
  const card=ARCANA[id];
  const chosen=TOPICS.find(x=>x.id===topic)||TOPICS[0];
  return {meaning:reversed?card.shadow:card.light,prompt:card.prompts[chosen.id],advice:card.advice};
}
export function parseLaunch(raw) {
  const params=new URLSearchParams(raw), signed=new URLSearchParams(), seen=new Set();
  for(const [key,value] of params)if(key.startsWith('vk_')||key==='sign'){
    if(seen.has(key))return null;
    seen.add(key);signed.append(key,value);
  }
  if(params.get('vk_app_id')!=='54582199'||!/^[1-9]\d{0,15}$/.test(params.get('vk_user_id')||'')||!/^\d{9,12}$/.test(params.get('vk_ts')||'')||!/^[A-Za-z0-9_-]{43}$/.test(params.get('sign')||'')||signed.toString().length>8192)return null;
  return signed.toString(); // Syntax only. The server alone authenticates this.
}
export function validProgress(p) {
  return p && typeof p.dayUtc==='string' && /^\d{4}-\d{2}-\d{2}$/.test(p.dayUtc) && Number.isFinite(Date.parse(p.dayUtc)) && Array.isArray(p.arcana) && p.arcana.every(validId) && new Set(p.arcana).size===p.arcana.length && Number.isSafeInteger(p.streak) && p.streak>=0 && Number.isSafeInteger(p.crystals) && p.crystals>=0 && typeof p.claimedToday==='boolean' && typeof p.dailyCardDrawn==='boolean' && (p.dailyCardId===null||validId(p.dailyCardId)) && p.dailyCardDrawn===(p.dailyCardId!==null);
}
export function validSpread(data,count) {
  return data?.kind===(count===1?'one':'three') && Array.isArray(data.cards) && data.cards.length===count && new Set(data.cards.map(c=>c?.id)).size===count && data.cards.every(c=>c && validId(c.id) && typeof c.reversed==='boolean' && ['position','meaning','advice'].every(k=>typeof c[k]==='string' && c[k].length>0 && c[k].length<=350));
}
