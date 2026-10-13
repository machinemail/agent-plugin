# Changelog

All notable changes to this plugin are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the plugin uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-13

### Added

- `plugin.json` manifest for the Agent Plugins Specification v1.0.0, with `com.openai` display metadata.
- `mcp.json` with the hosted MachineMail MCP server, `https://mcp.machinemail.dev/mcp`, over Streamable HTTP. Authorization is left to the client (OAuth).
- Skills: `read-email-safely`, `receive-verification-code`, `triage-inbox`, `reply-and-draft` and `register-agent-inbox`.
- Claude Code compatibility files (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`) and a Codex marketplace catalog (`.agents/plugins/marketplace.json`).
- CI that validates the manifest and MCP configuration against the v1.0.0 JSON Schemas, each skill with `skills-ref`, and the remaining spec rules with `scripts/check.mjs`.

[0.1.0]: https://github.com/machinemail/agent-plugin/releases/tag/v0.1.0
