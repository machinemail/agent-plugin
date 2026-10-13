#!/usr/bin/env node
// Checks the Agent Plugins v1.0.0 rules that the JSON Schemas cannot express,
// plus consistency between the portable package and the compatibility files.
// Usage: node scripts/check.mjs [plugin-root]   (no dependencies)

import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = realpathSync(resolve(process.argv[2] ?? '.'));
const errors = [];
const fail = (msg) => errors.push(msg);
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(join(root, p), 'utf8'));
  } catch (e) {
    fail(`${p}: ${e.message}`);
    return undefined;
  }
};
const inside = (p) => {
  const real = realpathSync(p);
  return real === root || real.startsWith(root + sep);
};

const SPEC = '1.0.0';
const PLUGIN_SCHEMA = `https://agent-plugins.org/schemas/${SPEC}/plugin.schema.json`;
const MCP_SCHEMA = `https://agent-plugins.org/schemas/${SPEC}/mcp.schema.json`;

// Manifest
const plugin = readJson('plugin.json');
if (plugin) {
  if (plugin.$schema !== PLUGIN_SCHEMA) fail(`plugin.json: $schema must be ${PLUGIN_SCHEMA}`);
  for (const k of ['skills', 'mcpServers', 'hooks', 'agents', 'commands']) if (k in plugin) fail(`plugin.json: inline component field "${k}" is not allowed`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(plugin.version ?? '')) fail('plugin.json: version should be Semantic Versioning');
  for (const [ns, v] of Object.entries(plugin.extensions ?? {})) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ns)) fail(`plugin.json: extension namespace "${ns}" is not reverse-domain`);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`plugin.json: extensions.${ns} must be an object`);
  }
  // Plugin-relative asset paths in the com.openai extension
  const ui = plugin.extensions?.['com.openai']?.interface ?? {};
  for (const key of ['logo', 'composerIcon']) {
    const p = ui[key];
    if (p === undefined) continue;
    if (!p.startsWith('./')) fail(`plugin.json: ${key} must start with ./`);
    else if (!existsSync(join(root, p))) fail(`plugin.json: ${key} ${p} does not exist`);
    else if (!inside(join(root, p))) fail(`plugin.json: ${key} ${p} resolves outside the plugin root`);
  }
}

// MCP
if (existsSync(join(root, 'mcp.json'))) {
  const mcp = readJson('mcp.json');
  if (mcp) {
    if (mcp.$schema !== MCP_SCHEMA) fail(`mcp.json: $schema must be ${MCP_SCHEMA} (same spec version as plugin.json)`);
    for (const [name, s] of Object.entries(mcp.mcpServers ?? {})) {
      if (s.type === 'streamable-http' || s.type === 'sse') {
        let u;
        try {
          u = new URL(s.url);
        } catch {
          fail(`mcp.json: ${name}.url is not an absolute URL`);
          continue;
        }
        const loopback = u.hostname === 'localhost' || /^127\./.test(u.hostname) || u.hostname === '[::1]';
        if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) fail(`mcp.json: ${name}.url must use HTTPS`);
        if (u.username || u.password) fail(`mcp.json: ${name}.url must not contain user information`);
        if (u.hash) fail(`mcp.json: ${name}.url must not contain a fragment`);
        for (const h of Object.keys(s.headers ?? {})) if (/^(authorization|cookie|x-api-key)$/i.test(h)) fail(`mcp.json: ${name} must not embed credentials in header ${h}`);
      }
    }
  }
}

// Skills: immediate children of skills/ with SKILL.md; frontmatter name must equal the directory name
const skillsDir = join(root, 'skills');
const skillNames = [];
if (existsSync(skillsDir)) {
  for (const d of readdirSync(skillsDir)) {
    const dir = join(skillsDir, d);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, 'SKILL.md');
    if (!existsSync(file)) {
      fail(`skills/${d}: no SKILL.md`);
      continue;
    }
    if (!inside(file)) fail(`skills/${d}/SKILL.md resolves outside the plugin root`);
    const src = readFileSync(file, 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(src);
    if (!fm) {
      fail(`skills/${d}/SKILL.md: missing YAML frontmatter`);
      continue;
    }
    const name = /^name:\s*(.+)$/m.exec(fm[1])?.[1].trim();
    if (name !== d) fail(`skills/${d}/SKILL.md: name "${name}" must match the directory name`);
    if (!/^description:\s*\S/m.test(fm[1])) fail(`skills/${d}/SKILL.md: description is required`);
    const lines = src.split('\n').length;
    if (lines > 500) fail(`skills/${d}/SKILL.md: ${lines} lines; keep it under 500`);
    // Links to other skills by name must point at a skill in this plugin
    for (const m of src.matchAll(/the `([a-z0-9-]+)` skill/g)) if (!existsSync(join(skillsDir, m[1], 'SKILL.md'))) fail(`skills/${d}/SKILL.md: refers to missing skill ${m[1]}`);
    skillNames.push(d);
  }
}
if (skillNames.length === 0) fail('skills/: no skills found');

// Compatibility files must agree with the portable manifest
const claude = existsSync(join(root, '.claude-plugin/plugin.json')) ? readJson('.claude-plugin/plugin.json') : undefined;
if (plugin && claude) {
  for (const k of ['name', 'version', 'description', 'license', 'homepage', 'repository']) {
    if (JSON.stringify(claude[k]) !== JSON.stringify(plugin[k])) fail(`.claude-plugin/plugin.json: ${k} differs from plugin.json`);
  }
}
if (existsSync(join(root, '.mcp.json'))) {
  const compat = readJson('.mcp.json');
  const portable = existsSync(join(root, 'mcp.json')) ? readJson('mcp.json') : undefined;
  for (const [name, s] of Object.entries(portable?.mcpServers ?? {})) {
    if (compat?.mcpServers?.[name]?.url !== s.url) fail(`.mcp.json: server ${name} url differs from mcp.json`);
  }
}
for (const p of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
  if (!existsSync(join(root, p))) continue;
  const m = readJson(p);
  const entry = m?.plugins?.find((e) => e.name === plugin?.name);
  if (!entry) fail(`${p}: no entry named ${plugin?.name}`);
  else if (entry.version !== undefined && entry.version !== plugin.version) fail(`${p}: version differs from plugin.json`);
}

// No credentials anywhere in the package
const secretPatterns = [/mm_live_[A-Za-z0-9]{32}/, /gh[pousr]_[A-Za-z0-9]{36}/, /github_pat_[A-Za-z0-9_]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isSymbolicLink() && !inside(p)) fail(`${relative(root, p)}: symlink resolves outside the plugin root`);
    else if (e.isDirectory()) walk(p);
    else if (e.isFile() && !/\.(png|jpe?g|gif|webp|ico)$/i.test(e.name)) {
      const text = readFileSync(p, 'utf8');
      for (const re of secretPatterns) if (re.test(text)) fail(`${relative(root, p)}: looks like it contains a credential (${re})`);
    }
  }
};
walk(root);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ plugin ${plugin.name}@${plugin.version}: manifest, MCP and ${skillNames.length} skills (${skillNames.join(', ')}) pass the checks`);
