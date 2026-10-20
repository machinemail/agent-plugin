#!/usr/bin/env node
// Builds the release archives in dist/. No dependencies.
// Usage: node scripts/package.mjs [plugin-root] [out-dir]
//
// dist/machinemail-agent-plugin.zip      the plugin, in a top-level machinemail/ folder
// dist/machinemail-skill-<name>.zip      one skill, in a top-level <name>/ folder
// dist/manifest.json                     name, version, tag, commit and each asset's size and sha256
// dist/SHA256SUMS                        sha256sum -c format, for the zips and manifest.json
//
// The zips are reproducible: entries are sorted, every timestamp is 1980-01-01 00:00,
// permissions are fixed (0644 files, 0755 folders) and there are no extra fields.

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync, crc32 } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = resolve(process.argv[2] ?? '.');
const out = resolve(process.argv[3] ?? join(root, 'dist'));

// What a client installs. Everything else (.git, .github, scripts/, dist/) stays out.
const PLUGIN_FILES = ['plugin.json', 'mcp.json', 'skills', 'assets', 'README.md', 'LICENSE', 'CHANGELOG.md', '.claude-plugin', '.mcp.json', '.agents'];
const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);

const plugin = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'));
const version = plugin.version;
const tag = `v${version}`;

// List files under a path, relative to root, with forward slashes.
const listFiles = (rel) => {
  const abs = join(root, rel);
  if (!existsSync(abs)) throw new Error(`missing ${rel}`);
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs)
    .filter((n) => !IGNORED.has(n))
    .flatMap((n) => listFiles(`${rel}/${n}`));
};

// Add the parent folders of every file, so unzip tools create them with fixed permissions.
const withFolders = (files) => {
  const all = new Set();
  for (const f of files) {
    all.add(f);
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) all.add(parts.slice(0, i).join('/') + '/');
  }
  return [...all].sort();
};

// A minimal zip writer (PKWARE APPNOTE): local headers, central directory, end record.
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const zip = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const isDir = name.endsWith('/');
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = data ?? Buffer.alloc(0);
    const crc = crc32(raw);
    const deflated = isDir ? raw : deflateRawSync(raw, { level: 9 });
    const method = isDir || deflated.length >= raw.length ? 0 : 8;
    const body = method === 8 ? deflated : raw;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // no extra fields
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the permissions below apply
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE((isDir ? (0o040755 << 16) | 0x10 : 0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
};

// Build a zip whose entries are `files` (relative to `base`) placed under `prefix/`.
const buildZip = (prefix, base, files) => {
  const source = new Map(files.map((f) => [`${prefix}/${f.slice(base.length)}`, f]));
  return zip(withFolders([...source.keys()]).map((name) => ({ name, data: source.has(name) ? readFileSync(join(root, source.get(name))) : undefined })));
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const assets = [];
const write = (name, buf) => {
  writeFileSync(join(out, name), buf);
  assets.push({ name, size: buf.length, sha256: sha256(buf) });
};

// The whole plugin, in a folder named after the plugin. Unzipping it gives the plugin root.
write('machinemail-agent-plugin.zip', buildZip(plugin.name, '', PLUGIN_FILES.flatMap(listFiles)));

// One zip per skill, with the skill folder at the top: the shape claude.ai and Claude Desktop accept.
const skills = readdirSync(join(root, 'skills'))
  .filter((n) => existsSync(join(root, 'skills', n, 'SKILL.md')))
  .sort();
for (const name of skills) write(`machinemail-skill-${name}.zip`, buildZip(name, `skills/${name}/`, listFiles(`skills/${name}`)));

let commit = process.env.GITHUB_SHA;
if (!commit) {
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    commit = null;
  }
}
const manifest = Buffer.from(JSON.stringify({ name: plugin.name, version, tag, commit, skills, assets }, null, 2) + '\n');
writeFileSync(join(out, 'manifest.json'), manifest);

const sums = [...assets, { name: 'manifest.json', sha256: sha256(manifest) }].map((a) => `${a.sha256}  ${a.name}\n`).join('');
writeFileSync(join(out, 'SHA256SUMS'), sums);

for (const a of assets) console.log(`${a.name}  ${a.size} bytes`);
console.log(`manifest.json, SHA256SUMS  (${plugin.name} ${tag}, commit ${commit?.slice(0, 7) ?? 'unknown'})`);
