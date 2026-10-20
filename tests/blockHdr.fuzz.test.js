// Property-based fuzzing with fast-check: thousands of generated inputs per property, against the
// real blockHdr.js (loaded by harness.js). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadExtension } from './harness.js';

const page = loadExtension();
const mse = type => page.MediaSource.isTypeSupported(type);
const RUNS = { numRuns: 3000 };

const twoDigits = fc.integer({ min: 0, max: 99 }).map(n => String(n).padStart(2, '0'));
const bitDepth = fc.constantFrom('08', '10', '12');
const isHdrTransfer = t => t === '16' || t === '18';
// "video/webm; codecs="…"", with and without quotes and spaces around '='
const mime = codec => fc.tuple(fc.constantFrom('video/webm', 'video/mp4'), fc.constantFrom('', ' '), fc.constantFrom('"', ''))
  .map(([type, space, quote]) => `${type};${space}codecs${space}=${space}${quote}${codec}${quote}`);

// vp09.<profile>.<level>.<bitDepth>.<chroma>.<primaries>.<transfer>.<matrix>.<range>
const vp9Full = fc.record({
  profile: fc.constantFrom('00', '01', '02', '03'), level: twoDigits, depth: bitDepth, chroma: twoDigits,
  primaries: twoDigits, transfer: twoDigits, matrix: twoDigits, range: fc.constantFrom('00', '01'),
});
// av01.<profile>.<levelTier>.<bitDepth>.<mono>.<chroma>.<primaries>.<transfer>.<matrix>.<range>
const av1Full = fc.record({
  profile: fc.constantFrom('0', '1', '2'), level: fc.tuple(twoDigits, fc.constantFrom('M', 'H')).map(([l, t]) => l + t),
  depth: bitDepth, mono: fc.constantFrom('0', '1'), chroma: fc.constantFrom('110', '111', '000'),
  primaries: twoDigits, transfer: twoDigits, matrix: twoDigits, range: fc.constantFrom('0', '1'),
});

test('full VP9 codec strings are blocked exactly when the transfer function is PQ or HLG', () => {
  fc.assert(fc.property(vp9Full.chain(c => fc.tuple(fc.constant(c), mime(
    ['vp09', c.profile, c.level, c.depth, c.chroma, c.primaries, c.transfer, c.matrix, c.range].join('.')))),
  ([c, type]) => mse(type) === !isHdrTransfer(c.transfer)), RUNS);
});

test('full AV1 codec strings are blocked exactly when the transfer function is PQ or HLG', () => {
  fc.assert(fc.property(av1Full.chain(c => fc.tuple(fc.constant(c), mime(
    ['av01', c.profile, c.level, c.depth, c.mono, c.chroma, c.primaries, c.transfer, c.matrix, c.range].join('.')))),
  ([c, type]) => mse(type) === !isHdrTransfer(c.transfer)), RUNS);
});

test('codecs that are never HDR always pass through', () => {
  const sdr = fc.oneof(
    fc.stringMatching(/^avc1\.[0-9a-f]{6}$/),
    fc.integer({ min: 1, max: 42 }).map(n => `mp4a.40.${n}`),
    fc.constantFrom('opus', 'vorbis', 'flac', 'mp4a.69', 'ec-3'),
  );
  fc.assert(fc.property(sdr.chain(mime), type => mse(type) === true), RUNS);
});

test('any spelling of "dynamic-range: high" is answered "not HDR"; other queries pass through', () => {
  const caseMix = word => fc.array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map(up => [...word].map((ch, i) => (up[i] ? ch.toUpperCase() : ch)).join(''));
  const spaces = fc.stringMatching(/^ {0,3}$/);
  const hdrQuery = fc.tuple(fc.constantFrom('', 'screen and ', '(min-width: 600px) and '), caseMix('dynamic-range'),
    spaces, spaces, caseMix('high')).map(([pre, dr, s1, s2, high]) => `${pre}(${dr}${s1}:${s2}${high})`);
  fc.assert(fc.property(hdrQuery, q => page.matchMedia(q).matches === false), RUNS);

  const otherQuery = fc.string({ maxLength: 80 }).filter(q => !/dynamic-range\s*:\s*high/i.test(q));
  fc.assert(fc.property(otherQuery, q => page.matchMedia(q).media === q), RUNS);
});

test('nothing a page can pass makes a patched API throw', async () => {
  await fc.assert(fc.asyncProperty(fc.anything(), async value => {
    mse(value);
    page.HTMLMediaElement.prototype.canPlayType(value);
    page.matchMedia(value);
    await page.MediaCapabilities.prototype.decodingInfo(value);
    await page.MediaCapabilities.prototype.decodingInfo({ video: value });
    await page.MediaCapabilities.prototype.decodingInfo({ video: { contentType: value, transferFunction: value } });
    return true;
  }), RUNS);
});

test('long random input stays fast (no regex blow-up)', () => {
  const long = fc.tuple(fc.constantFrom('codecs=', 'video/webm; codecs="', 'dynamic-range', ''), fc.string({ minLength: 5000, maxLength: 50000 }))
    .map(([prefix, rest]) => prefix + rest);
  fc.assert(fc.property(long, s => {
    const start = performance.now();
    mse(s);
    page.matchMedia(s);
    assert.ok(performance.now() - start < 100, `took ${(performance.now() - start).toFixed(0)} ms`);
  }), { numRuns: 300 });
});
