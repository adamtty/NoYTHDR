// Runs the real blockHdr.js in a sandbox with a fake page and Firefox's content-script helpers
// (wrappedJSObject, exportFunction, cloneInto), then checks what the patched page APIs answer.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../blockHdr.js', import.meta.url), 'utf8');

function loadExtension() {
  const page = {
    Promise,
    MediaSource: { isTypeSupported: () => true },
    HTMLMediaElement: { prototype: { canPlayType: () => 'probably' } },
    MediaCapabilities: {
      prototype: { decodingInfo: () => Promise.resolve({ supported: true, smooth: true, powerEfficient: true }) },
    },
    matchMedia: query => ({ media: query, matches: query !== 'not all' }),
  };
  const sandbox = {
    window: { wrappedJSObject: page },
    exportFunction: (fn, target, { defineAs }) => { target[defineAs] = fn; },
    cloneInto: obj => structuredClone(obj),
  };
  vm.runInNewContext(SCRIPT, sandbox);
  return page;
}

const page = loadExtension();
const mse = type => page.MediaSource.isTypeSupported(type);

test('HDR codec strings are refused', () => {
  for (const codec of [
    'vp09.02.51.10.01.09.16.09.00', // VP9 profile 2, PQ
    'vp09.02.51.10.01.09.18.09.00', // VP9, HLG
    'av01.0.12M.10.0.110.09.16.09.0', // AV1, PQ
    'av01.0.12M.10', // AV1 10-bit, colour fields omitted
    'vp09.02.51.10', // VP9 profile 2, colour fields omitted
    'hev1.2.4.L153.B0', // HEVC Main 10
    'hvc1.02.4.L153.B0',
  ]) {
    assert.equal(mse(`video/webm; codecs="${codec}"`), false, codec);
  }
});

test('SDR codec strings pass through to the browser', () => {
  for (const codec of [
    'vp09.00.40.08', // VP9 profile 0, 8-bit
    'vp09.00.51.08.01.01.01.01.00', // VP9 with BT.709 transfer
    'av01.0.08M.08', // AV1 8-bit
    'avc1.640028', // H.264
    'hev1.1.6.L93.B0', // HEVC Main
    'mp4a.40.2', // audio
  ]) {
    assert.equal(mse(`video/mp4; codecs="${codec}"`), true, codec);
  }
});

test('multi-codec strings are refused if any codec is HDR', () => {
  assert.equal(mse('video/webm; codecs="vp09.02.51.10.01.09.16.09.00, opus"'), false);
  assert.equal(mse('video/webm; codecs="vp09.00.40.08, opus"'), true);
});

test('canPlayType answers "" (no) for HDR and asks the browser otherwise', () => {
  const canPlay = page.HTMLMediaElement.prototype.canPlayType;
  assert.equal(canPlay('video/webm; codecs="vp09.02.51.10.01.09.16.09.00"'), '');
  assert.equal(canPlay('video/webm; codecs="vp09.00.40.08"'), 'probably');
});

test('MediaCapabilities.decodingInfo reports HDR configs as unsupported', async () => {
  const info = config => page.MediaCapabilities.prototype.decodingInfo(config);
  for (const video of [
    { contentType: 'video/webm; codecs="vp09.00.40.08"', transferFunction: 'pq' },
    { contentType: 'video/webm; codecs="vp09.00.40.08"', transferFunction: 'hlg' },
    { contentType: 'video/webm; codecs="vp09.00.40.08"', hdrMetadataType: 'smpteSt2086' },
    { contentType: 'video/webm; codecs="vp09.02.51.10.01.09.16.09.00"' },
  ]) {
    assert.deepEqual(await info({ type: 'media-source', video }), { supported: false, smooth: false, powerEfficient: false });
  }
  assert.equal((await info({ type: 'media-source', video: { contentType: 'video/webm; codecs="vp09.00.40.08"' } })).supported, true);
  assert.equal((await info({ type: 'media-source', audio: { contentType: 'audio/webm; codecs="opus"' } })).supported, true);
});

test('matchMedia says the display is not HDR', () => {
  assert.equal(page.matchMedia('(dynamic-range: high)').matches, false);
  assert.equal(page.matchMedia('(DYNAMIC-RANGE:HIGH)').matches, false);
  assert.equal(page.matchMedia('(min-width: 600px)').matches, true);
});

test('odd values from the page are answered without throwing', () => {
  for (const value of [undefined, null, 42, {}, [], '', 'codecs=', 'video/webm; codecs=""']) {
    assert.doesNotThrow(() => mse(value), String(value));
    assert.doesNotThrow(() => page.matchMedia(value), String(value));
  }
  assert.doesNotThrow(() => page.MediaCapabilities.prototype.decodingInfo(undefined));
});

test('hostile strings are handled in linear time (no regex blow-up)', () => {
  const nasty = [
    'codecs=' + ' '.repeat(200_000),
    'codecs="' + 'a'.repeat(200_000),
    'video/webm; codecs="' + 'vp09.02.'.repeat(30_000) + '"',
    'dynamic-range' + ' '.repeat(200_000) + ':x',
  ];
  for (const s of nasty) {
    const start = performance.now();
    mse(s);
    page.matchMedia(s);
    assert.ok(performance.now() - start < 250, `took ${(performance.now() - start).toFixed(0)} ms`);
  }
});
