import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'v6.spec.mjs',fullyParallel:false,workers:1,retries:0,timeout:45000,
  expect:{timeout:10000},reporter:[['list'],['html',{outputFolder:'report/v6',open:'never'}]],outputDir:'test-results/v6',
  webServer:{command:'node v6-canonical-server.mjs',url:'http://127.0.0.1:8766/v6/',reuseExistingServer:false},
  // Synthetic HMAC is used only by the Node fixture, never store authenticated traces.
  use:{baseURL:'http://127.0.0.1:8765',browserName:'chromium',trace:'off',screenshot:'only-on-failure',actionTimeout:10000},
  projects:[320,360,393,430].map(width=>({name:`android-${width}`,use:{viewport:{width,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:width===430?1.25:2}}))
});
