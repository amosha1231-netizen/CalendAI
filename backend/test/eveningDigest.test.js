const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDigestDispatcher, buildDigestMessage, mergeEvents, nextDigestFire, STALE_MS } = require('../services/eveningDigest');

const TZ = 'Asia/Jerusalem';

test('nextDigestFire lands on the chosen evening time in the user zone', () => {
  // 2026-11-05 14:00 UTC = 16:00 in Jerusalem (UTC+2 in November)
  const next = nextDigestFire({ time: '21:00', timezone: TZ }, new Date('2026-11-05T14:00:00Z'));
  assert.equal(next.toISOString(), '2026-11-05T19:00:00.000Z');
  const after = nextDigestFire({ time: '21:00', timezone: TZ }, new Date('2026-11-05T19:30:00Z'));
  assert.equal(after.toISOString(), '2026-11-06T19:00:00.000Z');
});

test('nextDigestFire skips blocked (Shabbat) evenings', () => {
  // Friday 2026-11-06 21:00 is blocked → Saturday night instead
  const isShabbatAt = instant => instant.toISOString() === '2026-11-06T19:00:00.000Z';
  const next = nextDigestFire({ time: '21:00', timezone: TZ }, new Date('2026-11-06T10:00:00Z'), isShabbatAt);
  assert.equal(next.toISOString(), '2026-11-07T19:00:00.000Z');
});

test('mergeEvents sorts by time, puts all-day first and drops duplicates', () => {
  const merged = mergeEvents([
    [{ title: 'Gym', startTime: '18:00' }, { title: 'Standup', startTime: '09:00' }],
    [{ title: 'standup ', startTime: '09:00' }, { title: 'Holiday', startTime: '', allDay: true }]
  ]);
  assert.deepEqual(merged.map(e => e.title), ['Holiday', 'Standup', 'Gym']);
});

test('buildDigestMessage lists tomorrow in Hebrew, capped with a count of the rest', () => {
  const events = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'].map((t, i) => ({ title: `E${i}`, startTime: t }));
  const { title, body } = buildDigestMessage(events, { lang: 'he', isoDate: '2026-11-06' });
  assert.equal(title, '🌙 הלו״ז שלך למחר (יום שישי)');
  assert.match(body, /^7 אירועים, הראשון ב-08:00/);
  assert.match(body, /08:00 E0/);
  assert.match(body, /ועוד 2…$/);
});

test('buildDigestMessage says when tomorrow is free', () => {
  const { body } = buildDigestMessage([], { lang: 'en', isoDate: '2026-11-08' });
  assert.match(body, /Nothing on the calendar tomorrow/);
});

function fakeUserModel(users) {
  return {
    find(query) {
      const now = query['eveningDigest.nextFireAt'].$lte;
      const list = users.filter(u => u.eveningDigest.enabled && u.eveningDigest.nextFireAt <= now);
      return { sort: () => ({ limit: () => ({ lean: async () => list.map(u => JSON.parse(JSON.stringify(u), (k, v) => (k === 'nextFireAt' ? new Date(v) : v))) }) }) };
    },
    async findOneAndUpdate(filter, update) {
      const u = users.find(x => String(x._id) === String(filter._id));
      if (!u || u.eveningDigest.nextFireAt.getTime() !== new Date(filter['eveningDigest.nextFireAt']).getTime()) return null;
      u.eveningDigest.nextFireAt = update.$set['eveningDigest.nextFireAt'];
      return { _id: u._id };
    }
  };
}

test('dispatcher pushes tomorrow\'s schedule once and moves to the next evening', async () => {
  const fireAt = new Date('2026-11-05T19:00:00Z'); // Thursday 21:00 in Jerusalem
  const users = [{
    _id: 'u1',
    eveningDigest: { enabled: true, time: '21:00', timezone: TZ, lang: 'he', nextFireAt: fireAt },
    schedule: { Friday: [{ title: 'ארוחת בוקר', startTime: '08:30', endTime: '09:30', recurrence: 'weekly' }] },
    googleAccessToken: 'tok'
  }];
  const sent = [];
  const dispatcher = createDigestDispatcher({
    User: fakeUserModel(users),
    PushSubscription: { find: () => ({ lean: async () => [{ _id: 's1' }] }), deleteOne: async () => {} },
    push: { send: async (sub, payload) => { sent.push(payload); return { ok: true }; } },
    fetchGoogleEvents: async (user, isoDate) => { assert.equal(isoDate, '2026-11-06'); return [{ title: 'פגישה', startTime: '11:00' }]; },
    now: () => new Date(fireAt.getTime() + 20000),
    logger: { warn() {}, error() {} }
  });
  const result = await dispatcher.tick();
  assert.equal(result.fired, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0].title, /למחר \(יום שישי\)/);
  assert.match(sent[0].body, /08:30 ארוחת בוקר\n11:00 פגישה/);
  assert.equal(users[0].eveningDigest.nextFireAt.toISOString(), '2026-11-06T19:00:00.000Z');
  assert.equal((await dispatcher.tick()).fired, 0);
});

test('dispatcher skips a digest that is far overdue', async () => {
  const fireAt = new Date('2026-11-05T19:00:00Z');
  const users = [{ _id: 'u1', eveningDigest: { enabled: true, time: '21:00', timezone: TZ, nextFireAt: fireAt }, schedule: {} }];
  const sent = [];
  const dispatcher = createDigestDispatcher({
    User: fakeUserModel(users),
    PushSubscription: { find: () => ({ lean: async () => [{ _id: 's1' }] }) },
    push: { send: async (sub, p) => { sent.push(p); return { ok: true }; } },
    now: () => new Date(fireAt.getTime() + STALE_MS + 1000),
    logger: { warn() {}, error() {} }
  });
  const result = await dispatcher.tick();
  assert.equal(result.skipped, 1);
  assert.equal(sent.length, 0);
});
