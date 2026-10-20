// Loads the real blockHdr.js in a sandbox with a fake YouTube page and Firefox's content-script
// helpers (wrappedJSObject, exportFunction, cloneInto), and returns the patched page.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../blockHdr.js', import.meta.url), 'utf8');

export function loadExtension() {
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
