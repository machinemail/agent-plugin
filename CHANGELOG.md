# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the plugin uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-19

### Changed

- Synced all five skills with [machinemail/skills](https://github.com/machinemail/skills), where they were fact-checked against the MachineMail source. Each skill is now version 1.0.0 with a docs `homepage`. Notable corrections: auth.md and its endpoints live on `api.machinemail.dev`; `register-agent-inbox` now first checks for a signed-in MCP server or an API key before self-registering; sandbox limits (10 messages to 10 distinct recipients per 24 hours, 5 recipients per message, inbox kept 24 hours after its last mail); `known`-sender code checks accept `dmarc: none` with a DKIM pass; reply-all and draft-reply recipients; spam and unauthenticated mail is listed over MCP when filtered by label.
- The skills refer to companion skills (`machinemail`, `machinemail-mcp`, `machinemail-agent-signup`) that this plugin does not bundle. The README links to machinemail/skills and skills.sh for them, and `scripts/check.mjs` accepts references to them.

## [0.1.0] - 2026-10-13

### Added

- `plugin.json` manifest for the Agent Plugins Specification v1.0.0, with `com.openai` display metadata.
- `mcp.json` with the hosted MachineMail MCP server, `https://mcp.machinemail.dev/mcp`, over Streamable HTTP. Authorization is left to the client (OAuth).
- Skills: `read-email-safely`, `receive-verification-code`, `triage-inbox`, `reply-and-draft` and `register-agent-inbox`.
- Claude Code compatibility files (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`) and a Codex marketplace catalog (`.agents/plugins/marketplace.json`).
- CI that validates the manifest and MCP configuration against the v1.0.0 JSON Schemas, each skill with `skills-ref`, and the remaining spec rules with `scripts/check.mjs`.

[0.2.0]: https://github.com/machinemail/agent-plugin/compare/ecaaeda...main
[0.1.0]: https://github.com/machinemail/agent-plugin/commits/main
