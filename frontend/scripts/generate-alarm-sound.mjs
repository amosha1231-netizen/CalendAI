// Builds the native alarm ringtone (calendai_alarm.wav) used by background
// alarm notifications on iOS and Android. It is the same rising four-note
// figure as the in-app Web Audio alarm, getting louder over ~28 seconds.
// iOS refuses notification sounds longer than 30 seconds, so keep it under.
//
// Run: node scripts/generate-alarm-sound.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RATE = 22050;
const SECONDS = 28;
const NOTES = [523.25, 659.25, 783.99, 1046.5];
const PERIOD = 1.4;
const NOTE_GAP = 0.16;
const NOTE_LEN = 0.15;

const total = RATE * SECONDS;
const samples = new Float32Array(total);

for (let ringStart = 0; ringStart < SECONDS - 1; ringStart += PERIOD) {
  const progress = ringStart / SECONDS;
  const volume = 0.35 + 0.65 * Math.min(1, progress * 1.6);
  const intense = progress > 0.45;
  NOTES.forEach((freq, i) => {
    const start = Math.floor((ringStart + i * NOTE_GAP) * RATE);
    const len = Math.floor(NOTE_LEN * RATE);
    for (let n = 0; n < len && start + n < total; n++) {
      const t = n / RATE;
      const attack = Math.min(1, t / 0.01);
      const env = attack * Math.exp(-t * 18);
      const phase = 2 * Math.PI * freq * t;
      // Triangle-ish tone; a brighter square layer joins once it is loud.
      let v = (2 / Math.PI) * Math.asin(Math.sin(phase)) * 0.55;
      if (intense) v += Math.sign(Math.sin(phase * 2)) * 0.12;
      samples[start + n] += v * env * volume;
    }
  });
}

const buffer = Buffer.alloc(44 + total * 2);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + total * 2, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(RATE, 24);
buffer.writeUInt32LE(RATE * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(total * 2, 40);
for (let i = 0; i < total; i++) {
  const s = Math.max(-1, Math.min(1, samples[i] * 0.9));
  buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
}

const targets = [
  resolve(here, '../android/app/src/main/res/raw/calendai_alarm.wav'),
  resolve(here, '../ios/App/App/calendai_alarm.wav')
];
for (const file of targets) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buffer);
  console.log('wrote', file, `${(buffer.length / 1024).toFixed(0)} KB`);
}
