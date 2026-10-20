#!/usr/bin/env node
// Prints the GitHub Release notes for a tag: that version's CHANGELOG section plus install
// instructions. Fails if the tag does not match plugin.json. No dependencies.
// Usage: node scripts/release-notes.mjs <tag> [plugin-root]

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const tag = process.argv[2];
const root = resolve(process.argv[3] ?? '.');
const die = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const { name, version, repository } = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'));
if (!tag) die('usage: release-notes.mjs <tag>');
if (tag !== `v${version}`) die(`tag ${tag} does not match plugin.json version ${version} (expected v${version})`);
// scripts/check.mjs makes sure the compatibility files and marketplace entries carry the same version.

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}] - `));
if (start === -1) die(`CHANGELOG.md has no section for ${version}`);
let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
if (end === -1) end = lines.findIndex((l, i) => i > start && /^\[[^\]]+\]: /.test(l));
const section = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();

const download = `${repository}/releases/download/${tag}`;
console.log(`${section}

## Install

The plugin needs a MachineMail account. Sign up at https://machinemail.dev. The first time the agent uses a MachineMail tool, your client asks you to sign in.

- **Claude Code:** \`claude plugin marketplace add machinemail/agent-plugin\`, then \`claude plugin install ${name}@machinemail\`. To install from the zip instead, unzip it and run \`claude plugin marketplace add ./${name}\`.
- **Codex:** \`codex plugin marketplace add machinemail/agent-plugin\`, or \`codex plugin marketplace add ./${name}\` from the unzipped plugin.
- **claude.ai and Claude Desktop:** download a \`machinemail-skill-<name>.zip\` below and upload it under Customize > Skills. Connect the MCP server \`https://mcp.machinemail.dev/mcp\` as a custom connector so the skills have tools to call.
- **Other Agent Plugins clients** (VS Code, GitHub Copilot CLI, Cursor and more): install from \`${repository}\`, or unzip \`machinemail-agent-plugin.zip\` and point the client at the \`${name}/\` folder.

See the README for each client: ${repository}#install

## Assets

| File | What it is |
| --- | --- |
| [\`machinemail-agent-plugin.zip\`](${download}/machinemail-agent-plugin.zip) | The whole plugin in a \`${name}/\` folder |
| \`machinemail-skill-<name>.zip\` | One skill each, in a \`<name>/\` folder, for skill upload |
| [\`SHA256SUMS\`](${download}/SHA256SUMS) | Checksums. Verify with \`sha256sum -c SHA256SUMS\` |
| [\`manifest.json\`](${download}/manifest.json) | Version, tag, commit and each file's size and sha256 |`);
