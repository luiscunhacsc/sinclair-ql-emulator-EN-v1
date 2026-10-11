#!/bin/sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "Node.js 20.12 or later is required to run the emulator." \
    "Install it from https://nodejs.org/ and then try again."
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 20 || (major === 20 && minor >= 12) ? 0 : 1)' >/dev/null 2>&1; then
  printf '%s\n' "This emulator needs Node.js 20.12 or later." \
    "Update Node.js from https://nodejs.org/ and then try again." \
    "Installed version: $(node --version)"
  exit 1
fi

node scripts/serve.mjs
