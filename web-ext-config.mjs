export default {
  sourceDir: '.',
  artifactsDir: 'web-ext-artifacts',
  // Everything that isn't the extension itself stays out of the .xpi.
  // Ship only manifest.json, blockHdr.js, icon.svg and LICENSE.
  ignoreFiles: [
    'node_modules/**',
    'web-ext-artifacts/**',
    'tests',
    'tests/**',
    '.github',
    '.github/**',
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
    'renovate.json',
    'README.md',
    'SECURITY.md',
    '.gitignore',
    '.amo-upload-uuid',
    '.env',
    '.env.*',
    '.web-extrc*',
    '.DS_Store'
  ]
};
