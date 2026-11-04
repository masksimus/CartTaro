import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE='http://127.0.0.1:8776/CartTaro/art-preview/';
const files=JSON.parse(fs.readFileSync('art-preview/classic/manifest.json','utf8'));
assert.equal(files.length,22);
assert.equal(new Set(files.map(f=>f.sha256)).size,22);
for(const f of files){
  const bytes=fs.readFileSync(path.join('art-preview','classic',f.file));
  assert.equal(bytes.length,f.bytes,'Image byte size mismatch '+f.file);
  assert.ok(bytes[0]===255&&bytes[1]===216,'Not JPEG '+f.file);
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 for(const width of [320,360,393,768]){
  const context=await browser.newContext({viewport:{width,height:850},isMobile:width<500,hasTouch:width<500});
  const page=await context.newPage();
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>errors.push('Failed '+r.url()));
  page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'&&u.port==='8776')route.continue();
    else route.abort();
  });
  const resp=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:17000});
  assert.equal(resp.status(),200);
  assert.equal(await page.locator('#atlasGrid img').count(),22);
  // Force deferred cards to decode; broken links must not pass.
  const decoded=await page.evaluate(async()=>{
    const images=[...document.querySelectorAll('#atlasGrid img')];
    images.forEach(x=>x.loading='eager');
    return Promise.all(images.map(async im=>{
      try{await im.decode()}catch{}
      return {src:im.currentSrc,naturalWidth:im.naturalWidth,naturalHeight:im.naturalHeight};
    }));
  });
  assert.ok(decoded.every(x=>x.naturalWidth>=400&&x.naturalHeight>=650),
    JSON.stringify(decoded.filter(x=>x.naturalWidth<400)));
  assert.equal(new Set(decoded.map(x=>x.src)).size,22);
  assert.ok(decoded.every(x=>x.src.includes('/classic/')));
  assert.equal(requests.filter(u=>!u.startsWith('http://127.0.0.1:8776/')).length,0);
  assert.ok(await page.locator('.atlas-item').count()===22);
  await page.locator('#one').click();
  assert.equal(await page.locator('#readingDeck .flip-card').count(),1);
  await page.locator('#readingDeck .flip-card').first().click();
  assert.equal(await page.locator('#readingDeck .flip-card.revealed').count(),1);
  assert.equal(await page.locator('#readingDeck .front img').count(),1);
  assert.equal(await page.locator('#readingMeanings article').count(),1);
  await page.locator('#three').click();
  assert.equal(await page.locator('#readingDeck .flip-card').count(),3);
  for(let i=0;i<3;i++)await page.locator('#readingDeck .flip-card').nth(i).click();
  assert.equal(await page.locator('#readingMeanings article').count(),3);
  await page.locator('#atlasGrid .atlas-item').nth(8).click();
  assert.equal(await page.locator('#cardDialog').evaluate(x=>x.open),true);
  assert.equal(await page.locator('#dialogTitle').innerText(),'Сила');
  const modalImage=page.locator('#dialogArt img');
  await modalImage.evaluate(img=>img.decode());
  assert.ok(await modalImage.evaluate(img=>img.naturalWidth>=400));
  await page.locator('#closeDialog').click();
  assert.equal(await page.locator('#cardDialog').evaluate(x=>x.open),false);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=2,'Horizontal overflow at '+width+': '+overflow);
  assert.deepEqual(errors,[],'JS/network errors at '+width);
  if(width===393){
    await page.locator('#reading').scrollIntoViewIfNeeded();
    await page.screenshot({path:'original-393-reading.png',animations:'disabled'});
    await page.locator('#atlas').scrollIntoViewIfNeeded();
    await page.screenshot({path:'original-393-gallery.png',animations:'disabled'});
  }
  console.log(JSON.stringify({viewport:width,authenticImages:decoded.length,distinct:22,source:'local',oneCard:true,threeCard:true,modal:true,overflow,errors:0}));
  await context.close();
 }
}finally{
  await browser.close();
}
