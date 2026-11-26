// Run: node --test src/utils/liveSync.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLiveSync, sameData } from './liveSync.js';

function fakeEnv() {
  const listeners = {};
  const target = () => ({
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: (n) => { delete listeners[n]; }
  });
  const doc = { ...target(), visibilityState: 'visible' };
  const win = target();
  let clock = 1000;
  const timers = new Map();
  let nextId = 1;
  return {
    listeners, doc,
    advance(ms) { clock += ms; },
    tick() { for (const fn of timers.values()) fn(); },
    timerCount: () => timers.size,
    env: {
      window: win, document: doc, now: () => clock,
      setInterval: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
      clearInterval: (id) => { timers.delete(id); }
    }
  };
}

test('focus right after load is skipped, later focus syncs', () => {
  const f = fakeEnv(); let calls = 0;
  startLiveSync(() => calls++, { env: f.env, minGapMs: 15000 });
  f.listeners.focus();
  assert.equal(calls, 0);
  f.advance(20000);
  f.listeners.focus();
  assert.equal(calls, 1);
});

test('focus and visibilitychange together sync once', () => {
  const f = fakeEnv(); let calls = 0;
  startLiveSync(() => calls++, { env: f.env, minGapMs: 15000 });
  f.advance(60000);
  f.listeners.visibilitychange();
  f.listeners.focus();
  assert.equal(calls, 1);
});

test('interval runs only while visible', () => {
  const f = fakeEnv(); let calls = 0;
  startLiveSync(() => calls++, { env: f.env });
  assert.equal(f.timerCount(), 1);
  f.tick();
  assert.equal(calls, 1);
  f.doc.visibilityState = 'hidden';
  f.listeners.visibilitychange();
  assert.equal(f.timerCount(), 0);
  f.advance(120000);
  f.doc.visibilityState = 'visible';
  f.listeners.visibilitychange();
  assert.equal(calls, 2);
  assert.equal(f.timerCount(), 1);
});

test('stop removes listeners and timer', () => {
  const f = fakeEnv();
  const stop = startLiveSync(() => {}, { env: f.env });
  stop();
  assert.equal(f.timerCount(), 0);
  assert.equal(Object.keys(f.listeners).length, 0);
});

test('a throwing sync does not break later syncs', () => {
  const f = fakeEnv(); let calls = 0;
  startLiveSync(() => { calls++; throw new Error('x'); }, { env: f.env });
  f.tick(); f.tick();
  assert.equal(calls, 2);
});

test('sameData compares by content', () => {
  assert.ok(sameData({ a: [1] }, { a: [1] }));
  assert.ok(!sameData({ a: [1] }, { a: [2] }));
});
