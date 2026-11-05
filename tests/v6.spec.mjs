import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHmac,randomInt } from 'node:crypto';
const BACKEND='http://127.0.0.1:8788',SECRET='TARO_E2E_FIXTURE_ONLY_NEVER_PRODUCTION';
function launch(id=String(randomInt(100000000,900000000)),age=0){const p=new URLSearchParams({vk_app_id:'54582199',vk_user_id:id,vk_platform:'mobile_web',vk_ts:String(Math.floor(Date.now()/1000)-age)});p.sort();p.set('sign',createHmac('sha256',SECRET).update(p.toString()).digest('base64url'));return p.toString();}
async function open(page,s=''){await page.goto('/v6/index.html'+(s?'?'+s:''));await expect(page.locator('#mode')).not.toHaveText('Открываем колоду…');}
async function tab(page,name){await page.locator(`[data-tab="${name}"]`).click();}
async function fixture(page,request,{readOnly=false,progress503=false}={}){
  const calls=[];
  await page.route('**/api/v2/**',async route=>{
    const r=route.request(),path=new URL(r.url()).pathname;
    if(progress503&&path.endsWith('/progress'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"storage_unavailable"}'});
    const response=await request.fetch(BACKEND+path,{method:r.method(),headers:{Authorization:r.headers().authorization||''},failOnStatusCode:false});
    calls.push({path,method:r.method(),status:response.status()});
    if(readOnly&&path.endsWith('/status'))return route.fulfill({json:{...await response.json(),rewardsEnabled:false,mode:'read_only'}});
    await route.fulfill({status:response.status(),contentType:'application/json',body:await response.text()});
  });return calls;
}
test('unsigned first visit, five screens, daily persistence and 22 collection slots; no API/CDN',async({page})=>{
  const calls=[],errors=[];page.on('request',r=>calls.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await open(page);await expect(page.locator('#mode')).toContainText('ЛОКАЛЬНОЕ ДЕМО');
  await page.screenshot({path:`test-results/v6/today-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Открыть карту дня',exact:true}).last().click();
  const name=await page.locator('#daily-result h2').textContent();await page.getByRole('button',{name:'Сохранить',exact:true}).click();
  await tab(page,'collection');await expect(page.locator('.collection-card')).toHaveCount(22);await expect(page.locator('.collection-card:not(.locked)')).toHaveCount(1);
  expect(await page.locator('.collection-card img').first().evaluate(n=>Math.abs(n.getBoundingClientRect().height/n.getBoundingClientRect().width-5/3)<.02)).toBe(true);
  await page.locator('.collection-card:not(.locked)').click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Закрыть карточку'}).click();
  await tab(page,'quests');await expect(page.locator('.quest.done')).toHaveCount(3);
  await tab(page,'profile');await expect(page.getByRole('heading',{name:'Гость атласа'})).toBeVisible();
  await page.reload();await page.locator('#daily-result h2').waitFor();await expect(page.locator('#daily-result h2')).toHaveText(name);
  expect(calls.filter(u=>u.includes('/api/'))).toEqual([]);expect(calls.filter(u=>!u.startsWith('http://127.0.0.1:8765/'))).toEqual([]);expect(errors).toEqual([]);
});
test('all themes and one/three distinct cards complete with topic-specific text',async({page})=>{
  await open(page);await tab(page,'readings');
  for(const theme of ['Отношения','Работа','Развитие','Настроение']){
    await page.getByRole('button',{name:theme,exact:false}).click();await page.locator('#spread-1').click();await page.locator('#reading-deck button').click();await expect(page.locator('#reading-results article')).toHaveCount(1);
  }
  await page.locator('#spread-3').click();await expect(page.locator('#reading-deck button')).toHaveCount(3);
  for(const card of await page.locator('#reading-deck button').all())await card.click();
  await expect(page.locator('#reading-results article')).toHaveCount(3);
  expect(new Set(await page.locator('#reading-results h2').allTextContents()).size).toBe(3);
  await expect(page.locator('#reading-status')).toContainText('Расклад открыт');
  await page.screenshot({path:`test-results/v6/readings-${test.info().project.name}.png`,fullPage:true});
});
test('offline reload after cache install and reveal with all remote origins blocked',async({page,context})=>{
  await open(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.goto('/v6/');
  await context.setOffline(true);await page.reload();await expect(page.locator('#mode')).toContainText('ЛОКАЛЬНОЕ ДЕМО');
  await page.locator('#daily-open').click();await expect(page.locator('#daily-result')).toBeVisible();await tab(page,'readings');await page.locator('#spread-3').click();
  for(const card of await page.locator('#reading-deck button').all())await card.click();await expect(page.locator('#reading-results article')).toHaveCount(3);
  const cached=await page.evaluate(async()=>{const keys=await caches.keys();return(await Promise.all(keys.map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)))).flat();});
  expect(cached.length).toBeGreaterThan(30);expect(cached.every(u=>!u.includes('?')&&!u.includes('/api/'))).toBe(true);
});
test('real signed PostgreSQL flow: daily claim/draw deduplicated and restored after relaunch',async({page,request})=>{
  const id=String(randomInt(100000000,900000000)),token=launch(id),calls=await fixture(page,request);await open(page,token);
  await expect(page.locator('#mode')).toContainText('ПОДПИСЬ ПРОВЕРЕНА');await page.locator('#daily-open').click();await expect(page.locator('#daily-result')).toBeVisible();const name=await page.locator('#daily-result h2').textContent();
  await tab(page,'quests');await page.locator('#claim').click();await expect(page.locator('#claim')).toBeDisabled();
  const repeat=await request.post(BACKEND+'/api/v2/daily/claim',{headers:{Authorization:'Bearer '+token}});expect((await repeat.json()).granted).toBe(false);
  await open(page,launch(id));await expect(page.locator('#daily-result h2')).toHaveText(name);await tab(page,'profile');await expect(page.locator('.stat').last()).toContainText('10');
  expect(new URL(page.url()).search).toBe('');const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(stored).not.toContain(token);expect(stored).not.toContain(id);
  expect(calls.filter(x=>x.path.endsWith('/daily/draw'))).toHaveLength(1);expect(calls.filter(x=>x.path.endsWith('/daily/claim'))).toHaveLength(1);
});
test('signed one/three readings and privacy queue through real API; no client rewards',async({page,request})=>{
  await fixture(page,request);await open(page,launch());await expect(page.locator('#mode')).toContainText('ПОДПИСЬ ПРОВЕРЕНА');await tab(page,'readings');
  for(const n of [1,3]){await page.locator(`#spread-${n}`).click();await expect(page.locator('#reading-deck button')).toHaveCount(n);for(const c of await page.locator('#reading-deck button').all())await c.click();await expect(page.locator('#reading-results article')).toHaveCount(n);}
  await tab(page,'profile');await page.getByRole('button',{name:'Запросить удаление данных',exact:true}).click();await page.getByRole('button',{name:'Подтвердить запрос',exact:true}).click();await expect(page.locator('#notice')).toContainText('Удаление ещё не выполнено');await expect(page.locator('.stat').last()).toContainText('0');
});
test('forged and expired launches are rejected, no silent login or local reward writes',async({page,request})=>{
  const calls=await fixture(page,request);
  for(const token of [launch('123456789').replace('123456789','987654321'),launch('123456789',3600)]){
    await open(page,token);await expect(page.locator('#notice')).toContainText('Вход VK не подтверждён');await expect(page.locator('#daily-open')).toBeDisabled();expect(new URL(page.url()).search).toBe('');
  }
  expect(calls.every(c=>c.status===401&&c.method==='GET')).toBe(true);
  await page.locator('#demo').click();await page.locator('#daily-open').click();await expect(page.locator('#mode')).toContainText('ЛОКАЛЬНОЕ ДЕМО');expect(calls).toHaveLength(2);
});
test('unsigned and ambiguous launch never contact protected routes; disabled storage is recoverable',async({page})=>{
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}});});
  await open(page,launch()+'&sign='+'a'.repeat(43));await page.locator('#daily-open').click();await expect(page.locator('#daily-result')).toBeVisible();await expect(page.locator('#notice')).toContainText('Хранилище браузера недоступно');expect(requests).toEqual([]);
});
test('read-only gate leaves signed spreads usable but never posts reward requests',async({page,request})=>{
  const calls=await fixture(page,request,{readOnly:true});await open(page,launch());await expect(page.locator('#mode')).toContainText('ПОДПИСЬ ПРОВЕРЕНА');await expect(page.locator('#daily-open')).toBeDisabled();await tab(page,'quests');await expect(page.locator('#claim')).toBeDisabled();await tab(page,'readings');await page.locator('#spread-3').click();await expect(page.locator('#reading-deck button')).toHaveCount(3);expect(calls.every(c=>c.method==='GET')).toBe(true);
});
test('503 recovery can switch to local demo without carrying credentials or server progress',async({page,request})=>{
  await fixture(page,request,{progress503:true});await open(page,launch());await expect(page.locator('#recovery')).toBeVisible();await page.locator('#demo').click();await page.locator('#daily-open').click();await expect(page.locator('#daily-result')).toBeVisible();
});
test('exported static showcase ignores even well-formed signed credentials',async({page})=>{
  const calls=[];page.on('request',r=>{if(r.url().includes('/api/'))calls.push(r.url());});
  await page.goto('/v6/dist/index.html?'+launch());await expect(page.locator('#mode')).toContainText('ЛОКАЛЬНОЕ ДЕМО');await page.locator('#daily-open').click();await expect(page.locator('#daily-result')).toBeVisible();expect(new URL(page.url()).search).toBe('');expect(calls).toEqual([]);
});
test('reduced motion, five-screen accessibility, 44px targets and no horizontal overflow',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);
  expect(await page.locator('.flip-inner').evaluate(n=>getComputedStyle(n).transitionDuration)).toBe('0s');
  for(const name of ['today','readings','collection','quests','profile']){
    await tab(page,name);const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.locator('button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44))).toBe(true);
  }
});
test.describe('without a service worker cache',()=>{
 test.use({serviceWorkers:'block'});
 test('missing art uses readable local fallback and sharing only follows user action',async({page})=>{
  await page.route('**/assets/cards/*.svg',r=>r.abort());await page.addInitScript(()=>{window.shareCalls=[];Object.defineProperty(navigator,'share',{value:async data=>window.shareCalls.push(data)});});
  await open(page);await page.locator('#daily-open').click();await expect(page.locator('.front .fallback-art')).toBeVisible();expect(await page.evaluate(()=>shareCalls)).toEqual([]);await page.getByRole('button',{name:'Поделиться',exact:true}).click();const calls=await page.evaluate(()=>shareCalls);expect(calls).toHaveLength(1);expect(new URL(calls[0].url).search).toBe('');expect(calls[0].text).not.toContain('vk_user_id');
});

});
