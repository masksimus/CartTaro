import test from 'node:test';
import assert from 'node:assert/strict';
import {publicReleaseAllowed} from '../src/release-gate.mjs';

test('V5 production cannot award crystals without explicit release approval',()=>{
  assert.equal(publicReleaseAllowed({VERCEL_ENV:'production'}),false);
  assert.equal(publicReleaseAllowed({VERCEL_ENV:'production',TARO_V5_PUBLIC_RELEASE_CONFIRMED:'false'}),false);
  assert.equal(publicReleaseAllowed({VERCEL_ENV:'production',TARO_V5_PUBLIC_RELEASE_CONFIRMED:'true'}),true);
  assert.equal(publicReleaseAllowed({VERCEL_ENV:'preview'}),true);
  assert.equal(publicReleaseAllowed({VERCEL_ENV:'development'}),true);
});
