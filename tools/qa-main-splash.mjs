import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const inlineScripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
if(inlineScripts.length !== 1)throw new Error('Expected one inline application script');
new Script(inlineScripts[0],{filename:'carttaro-inline-main.js'});
console.log('Main inline script: parse OK ('+inlineScripts[0].length+' chars)');
if(process.argv[2] === 'syntax')process.exit(0);
if(process.argv[2] !== 'browser')throw new Error('Expected syntax/browser argument');
const {chromium}=await import('playwright');
const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1'],{stdio:'pipe'});
let browser;
try{
  // Python http.server starts locally; avoid Node 24 undici
  // runtime assertions on early-aborted streaming responses.
  await sleep(850);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const [scenario,vkScript] of [
    ['external-vk-blocked',null],
    ['vk-init-never-resolves',"window.vkBridge={send:function(method){if(method==='VKWebAppInit')return new Promise(()=>{});if(method==='VKWebAppStorageGet')return Promise.resolve({keys:[{value:'1'}]});return Promise.resolve({});},subscribe:function(){}};"]
  ]){
    const ctx=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
    await ctx.addInitScript(()=>localStorage.setItem('taro_consent','1'));
    const p=await ctx.newPage();
    const errs=[];
    p.on('pageerror',e=>errs.push(e.message));
    p.on('console',msg=>{if(msg.type()==='error')errs.push('console '+msg.text())});
    await p.route('**/unpkg.com/**',route=>vkScript?route.fulfill({status:200,contentType:'application/javascript',body:vkScript}):route.abort());
    await p.route('**/fonts.googleapis.com/**',route=>route.abort());
    await p.route('**/fonts.gstatic.com/**',route=>route.abort());
    await p.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded',timeout:16000});
    await p.waitForTimeout(5500);
    const state=await p.evaluate(()=>({
      splash:!!document.querySelector('#splash')&&!document.querySelector('#splash').classList.contains('hide'),
      consent:document.querySelector('#consentScreen')?.classList.contains('show'),
      main:document.querySelector('#mainApp')?.style.display,
      hasNav:!!document.querySelector('.tab-bar'),
      title:document.title
    }));
    console.log(JSON.stringify({scenario,state,errors:errs.slice(0,8)}));
    assert.equal(state.splash,false,scenario+' stuck on splash');
    assert.ok(state.main!== 'none' || state.consent,scenario+' shows neither game nor consent');
    await ctx.close();
  }
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}
