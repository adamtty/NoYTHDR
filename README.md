# NoYTHDR

[![CI](https://github.com/adamtty/NoYTHDR/actions/workflows/ci.yml/badge.svg)](https://github.com/adamtty/NoYTHDR/actions/workflows/ci.yml)
[![CodeQL](https://github.com/adamtty/NoYTHDR/actions/workflows/codeql.yml/badge.svg)](https://github.com/adamtty/NoYTHDR/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/adamtty/NoYTHDR/badge)](https://scorecard.dev/viewer/?uri=github.com/adamtty/NoYTHDR)

A small Firefox extension that stops YouTube from playing HDR video.

HDR videos on YouTube always ship SDR renditions at the same resolutions, so
this doesn't cost you 4K — you get the tone-mapped version, which is the one
that isn't blinding.

## How it works

YouTube decides what to play by asking the browser what it can decode, so the
extension answers "not HDR" on every path the player uses:

| Patched | Why |
| --- | --- |
| `MediaSource.isTypeSupported` | The classic codec probe |
| `HTMLMediaElement.prototype.canPlayType` | The same question via a media element |
| `navigator.mediaCapabilities.decodingInfo` | The modern path, and the one YouTube leans on now |
| `window.matchMedia` | Display probes for `(dynamic-range: high)` |

A stream counts as HDR when its codec string carries a PQ (16) or HLG (18)
transfer function, or when the MediaCapabilities config asks for `pq`/`hlg`/an
HDR metadata type. Short codec strings omit the colour fields, so >8-bit is
treated as HDR too — flip `BLOCK_HIGH_BIT_DEPTH_WHEN_UNSPECIFIED` in
`blockHdr.js` if you'd rather block only provably-HDR streams.

The patches are applied to the page's own globals through Firefox's
`wrappedJSObject` at `document_start`, so they're in place before the player
script runs. No inline script injection, so YouTube's CSP is a non-issue.

## Permanent install

Firefox removes add-ons loaded through `about:debugging` when it restarts. To
install NoYTHDR once and keep it through Firefox updates, first get an unlisted
package signed by Mozilla:

1. Install [Node.js 22 or newer](https://nodejs.org/) and run `npm install` in
   this directory.
2. Create an account on [addons.mozilla.org](https://addons.mozilla.org/) and
   generate API credentials from the
   [AMO API key page](https://addons.mozilla.org/developers/addon/api/key/).
3. Set the credentials for the current terminal and submit the add-on:

   ```sh
   export AMO_JWT_ISSUER='user:123456:789'
   export AMO_JWT_SECRET='your-secret'
   npm run sign
   ```

   Keep the secret out of this repository and shell-history files.
4. When Mozilla approves the submission, `web-ext-artifacts/` will contain a
   signed `.xpi`. In Firefox, open `about:addons`, click the gear button, choose
   **Install Add-on From File**, and select that `.xpi`.

That is a normal persistent installation: browser restarts and Firefox updates
do not remove it. Since this is an unlisted add-on, updating NoYTHDR later means
incrementing `version` in both `manifest.json` and `package.json`, signing the
new version, and installing its `.xpi` over the existing copy. The add-on ID
must remain `noythdr@adam` so Firefox recognises it as an update.

For development only, use `about:debugging` → **This Firefox** → **Load
Temporary Add-on**, then choose `manifest.json`.

## Development

```sh
npm ci --ignore-scripts   # exact versions from package-lock.json, no install scripts
npm test                  # the real blockHdr.js in a sandbox with a fake YouTube page
npm run lint
npm run build
```

The unsigned build is written to `web-ext-artifacts/`. Standard Firefox cannot
permanently install that build; use the signed `.xpi` produced by `npm run sign`.

## Check it's working

On an HDR video, the quality menu should no longer offer HDR options, and
`Stats for nerds` should show a `vp09.00…`/`avc1`/8-bit `av01` codec rather
than `vp09.02…`. You can also paste this into the console on a YouTube tab:

```js
MediaSource.isTypeSupported('video/webm; codecs="vp09.02.51.10.01.09.16.09.00"')  // false
MediaSource.isTypeSupported('video/webm; codecs="vp09.00.40.08"')                 // true
```

## Privacy and security

- **No permissions, no data.** The extension asks for no permissions, makes no network requests,
  stores nothing, and declares that it collects no data. It only runs on `youtube.com` and
  `youtube-nocookie.com`.
- **Careful with the page.** It patches YouTube's own page objects through Firefox's
  `wrappedJSObject`/`exportFunction`. Everything the page hands back is type-checked or only compared,
  and nothing from the extension's privileged side is passed to the page, so the worst a hostile page
  can do is undo the patches. The regexes run in linear time, so a crafted string can't hang the
  browser (the tests check this).
- **Only the extension is packaged.** The `.xpi` contains `manifest.json`, `blockHdr.js`, `icon.svg`
  and `LICENSE`; CI fails if anything else gets in.
- **Build tooling.** `web-ext` is a development tool and none of it ends up in the extension.
  `npm audit` still lists one advisory, `node-forge`, which has no fixed release yet. It reaches us only
  through `web-ext`'s Android runner (`web-ext run --target firefox-android`), which `lint`, `build`
  and `sign` never load.

Every push runs `web-ext lint`, the tests and a package check in CI, with CodeQL, OpenSSF Scorecard,
SHA-pinned actions on StepSecurity Harden-Runner and Renovate (which waits 3 days before proposing new
releases). Found a problem? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
