import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {chromium} from 'playwright';

const html=readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).filter(Boolean);
assert.equal(scripts.length,1);
new Script(scripts[0],{filename:'CartTaro-main.js'});
assert.ok(html.includes('bridgeWithTimeout'),'Retain earlier boot fix');
assert.ok(!html.includes('cdn.jsdelivr.net/npm/tarot-card-img'),'No card CDN');
const manifest=JSON.parse(readFileSync('art-preview/classic/manifest.json','utf8'));
assert.equal(manifest.length,22);
const match=html.match(/const RWS_CARD_FILES = Object.freeze\((\[[^\]]+\])\)/);
assert.ok(match);
assert.deepEqual(JSON.parse(match[1]),manifest.map(m=>m.file),'Preserve 22 card IDs');
console.log('PASS: source mapping, 22 historical images and VK bootstrap');

const now=new Date();
const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const url='http://127.0.0.1:8779/CartTaro/';
const bridgeSource = [
  'window.vkBridge={subscribe:function(){},send:async function(method,args){',
  'if(method==="VKWebAppInit")return {};',
  'if(method==="VKWebAppGetConfig")return {};',
  'if(method==="VKWebAppGetUserInfo")return {first_name:"QA"};',
  'if(method==="VKWebAppStorageGet")return {keys:args.keys.map(key=>({key,value:window.__vkTestingStore[key]||""}))};',
  'if(method==="VKWebAppStorageSet"){window.__vkTestingStore[args.key]=args.value;window.__vkWriteCount++;return {}};',
  'if(method==="VKWebAppShowNativeAds")return {result:true};',
  'return {};}};'
].join('\n');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [320,360,393]){
  const context=await browser.newContext({viewport:{width,height:852},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[],cardNetwork=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',req=>{if(req.resourceType()==='image')cardNetwork.push(req.url())});
  await page.addInitScript(({today})=>{
    window.__vkTestingStore={
      consent:'1',
      dailyCard:JSON.stringify({cardId:8,date:today}),
      history:JSON.stringify([{type:'daily',cardId:8,date:today}])
    };
    window.__vkWriteCount=0;
  },{today});
  await page.route('**/unpkg.com/**',route=>route.fulfill({status:200,contentType:'application/javascript',body:bridgeSource}));
  await page.route('**/fonts.googleapis.com/**',route=>route.abort());
  await page.route('**/fonts.gstatic.com/**',route=>route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:16000});
  await page.locator('#mainApp').waitFor({state:'visible',timeout:15000});
  await page.locator('#cardSymbol img').evaluate(img=>img.decode());
  const saved=await page.locator('#cardSymbol img').evaluate(img=>({
    src:img.currentSrc,nw:img.naturalWidth,nh:img.naturalHeight,fit:getComputedStyle(img).objectFit
  }));
  assert.ok(saved.src.endsWith('/art-preview/classic/08_Strength.jpg'),saved.src);
  assert.ok(saved.nw>=700&&saved.nh>=1100);
  assert.equal(saved.fit,'contain');
  assert.equal(await page.locator('#cardName').innerText(),'Сила');
  assert.equal(await page.evaluate(()=>window.__vkWriteCount),0);
  await page.locator('.tab').filter({hasText:'История'}).click();
  await page.locator('#historyList img').first().scrollIntoViewIfNeeded();
  await page.locator('#historyList img').first().evaluate(img=>{ img.loading='eager'; });
  await page.waitForFunction(() => {
    const img=document.querySelector('#historyList img');
    return !!img && img.complete && img.naturalWidth>=700;
  }, null, {timeout:15000});
  assert.ok((await page.locator('#historyList img').first().getAttribute('src')).endsWith('08_Strength.jpg'));
  await page.locator('.tab').filter({hasText:'Расклады'}).click();
  await page.locator('.spread-card').first().click();
  await page.locator('#paywallBtn').click();
  await page.locator('#modalReveal.show').waitFor({state:'visible',timeout:15000});
  const spreadImages=page.locator('#spreadCardsRow .mini-symbol img');
  assert.equal(await spreadImages.count(),3);
  await spreadImages.evaluateAll(imgs=>imgs.forEach(img=>{img.loading='eager'}));
  await page.waitForFunction(() => {
    const imgs=[...document.querySelectorAll('#spreadCardsRow .mini-symbol img')];
    return imgs.length===3 && imgs.every(img=>img.complete&&img.naturalWidth>=700);
  },null,{timeout:15000});
  const all=await spreadImages.evaluateAll(imgs=>imgs.map(img=>({
    src:img.currentSrc,width:img.naturalWidth,fit:getComputedStyle(img).objectFit
  })));
  assert.ok(all.every(x=>x.src.includes('/art-preview/classic/')&&x.width>=700&&x.fit==='contain'));
  assert.equal(new Set(all.map(x=>x.src)).size,3);
  const stored=await page.evaluate(()=>({
    daily:JSON.parse(window.__vkTestingStore.dailyCard),
    history:JSON.parse(window.__vkTestingStore.history),
    writes:window.__vkWriteCount
  }));
  assert.equal(stored.daily.cardId,8);
  assert.equal(stored.history[0].cardId,8);
  assert.ok(stored.writes<=1,'Spread only appends history');
  assert.ok(cardNetwork.every(u=>u.startsWith('http://127.0.0.1:8779/CartTaro/art-preview/classic/')),
    'Third-party image request');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=2,'Horizontal overflow '+width+': '+overflow);
  assert.deepEqual(errors,[]);
  if(width===393){
    await page.screenshot({path:'rws-vk-spread-393.png',animations:'disabled'});
    await page.locator('#modalReveal .modal-close').click();
    await page.locator('.tab').filter({hasText:'Карта дня'}).click();
    await page.screenshot({path:'rws-vk-daily-393.png',animations:'disabled'});
  }
  console.log(JSON.stringify({screen:width,savedArcana:'Сила',image:saved.nw+'x'+saved.nh,
    spreadImages:all.length,storedCardIdUnchanged:true,cardRequests:cardNetwork.length,overflow,errors:errors.length}));
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
 const page=await context.newPage();
 await page.addInitScript(()=>{window.__vkTestingStore={consent:'1'};window.__vkWriteCount=0});
 await page.route('**/unpkg.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:bridgeSource}));
 await page.route('**/fonts.googleapis.com/**',r=>r.abort());
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('#mainApp').waitFor({state:'visible'});
 await page.locator('#dailyCardFrame').click();
 await page.locator('#cardSymbol img').evaluate(img=>img.decode());
 const storedNew=await page.evaluate(()=>JSON.parse(window.__vkTestingStore.dailyCard));
 assert.ok(Number.isInteger(storedNew.cardId)&&storedNew.cardId>=0&&storedNew.cardId<22);
 assert.equal(storedNew.date,today);
 assert.ok(await page.evaluate(()=>window.__vkWriteCount>=2));
 console.log('PASS: new daily card persisted with same numeric card ID '+storedNew.cardId);
 await context.close();
} finally {await browser.close();}
