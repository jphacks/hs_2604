import assert from 'node:assert/strict';
import test from 'node:test';
import { readDemoConfig, isDemoUser } from '../src/features/demo/config.ts';
const valid = { KAGO_DEMO_ENABLED:'1', KAGO_DEMO_STORE_ID:'00000000-0000-4000-8000-000000000001', KAGO_DEMO_U1_EMAIL:'misaki.sato@example.test', KAGO_DEMO_U1_PASSWORD:'test-only', KAGO_DEMO_U2_EMAIL:'ken.tanaka@example.test', KAGO_DEMO_U2_PASSWORD:'test-only', KAGO_DEMO_U3_EMAIL:'yui.suzuki@example.test', KAGO_DEMO_U3_PASSWORD:'test-only' };
test('explicit flag and every fictional account required', () => {
 assert.ok(readDemoConfig(valid));
 for (const key of Object.keys(valid)) assert.equal(readDemoConfig({...valid,[key]:undefined}),null,key);
 assert.equal(readDemoConfig({...valid,KAGO_DEMO_U1_EMAIL:'real@example.com'}),null);
 assert.equal(readDemoConfig({...valid,KAGO_DEMO_STORE_ID:'invalid'}),null);
});
test('only three configured personas are accepted', () => {
 for(const id of ['U1','U2','U3']) assert.equal(isDemoUser(id),true);
 for(const id of ['U4','u1','',null,{},['U1']]) assert.equal(isDemoUser(id),false);
});
