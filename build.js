#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

// Compatibility shim for accidental `npx run build` usage.
// The real project build command is defined in package.json as `npm run build`.
const result = spawnSync("npm run build", {
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
