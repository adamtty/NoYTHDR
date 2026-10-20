# Security policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub:
[**Report a vulnerability**](https://github.com/adamtty/NoYTHDR/security/advisories/new).
Don't open a public issue for them.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a
reply within a week. Once it's fixed, you'll be credited in the advisory unless you'd rather not be.

## Supported versions

Only the latest version is supported.

## Scope

In scope: the extension itself (`manifest.json`, `blockHdr.js`), especially anything that lets a web
page use the extension's privileges, read or change anything outside YouTube's own page objects, or
make the browser hang. The build tooling (`web-ext`) is in scope only where it changes what ends up
in the packaged extension.

Out of scope: vulnerabilities in Firefox, YouTube or `web-ext` itself (report those upstream).
