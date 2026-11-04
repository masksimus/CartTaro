import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = 'http://127.0.0.1:8776/CartTaro/art-preview/';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 for(const width of [320,360,393,768]){
  const context = await browser.newContext({viewport:{width,height:850},isMobile:width<500,hasTouch:width<500});
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('#atlasGrid .atlas-item').first().waitFor({timeout:15000});
  assert.equal(await page.locator('#atlasGrid .atlas-item').count(),22);
  assert.equal(await page.locator('#atlasGrid svg').count(),22);
  assert.equal(await page.locator('head link[href^="http"]').count(),0);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=2,'Horizontal overflow at '+width+': '+overflow);
  await page.locator('#one').click();
  assert.equal(await page.locator('#readingDeck .flip-card').count(),1);
  await page.locator('#readingDeck .flip-card').first().click();
  assert.equal(await page.locator('#readingDeck .flip-card.revealed').count(),1);
  assert.equal(await page.locator('#readingMeanings article').count(),1);
  await page.locator('#three').click();
  assert.equal(await page.locator('#readingDeck .flip-card').count(),3);
  for(let i=0;i<3;i++)await page.locator('#readingDeck .flip-card').nth(i).click();
  assert.equal(await page.locator('#readingMeanings article').count(),3);
  await page.locator('#atlasGrid .atlas-item').nth(8).click();
  assert.equal(await page.locator('#cardDialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#dialogTitle').innerText(),'Сила');
  await page.locator('#closeDialog').click();
  assert.equal(await page.locator('#cardDialog').evaluate(el=>el.open),false);
  assert.deepEqual(pageErrors,[],'JS errors at '+width);
  console.log(JSON.stringify({viewport:width,arcana:22,oneCard:true,threeCard:true,modal:true,overflow,errors:pageErrors.length}));
  if(width===393){
   await page.locator('#reading').scrollIntoViewIfNeeded();
   await page.screenshot({path:'art-preview-393-reading.png',animations:'disabled'});
   await page.locator('#atlas').scrollIntoViewIfNeeded();
   await page.screenshot({path:'art-preview-393-gallery.png',animations:'disabled'});
  }
  await context.close();
 }
} finally {await browser.close();}
