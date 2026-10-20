# Releasing

A release is a `v<version>` tag on `main`. Pushing the tag runs [the release workflow](.github/workflows/release.yml), which validates the plugin, builds the zips and publishes a GitHub Release with them.

## Cut a release

1. Pick the version with [Semantic Versioning](https://semver.org/). Skill wording changes are usually a patch. New skills or tools are a minor version.
2. Set the version in all three places:
   - `plugin.json`
   - `.claude-plugin/plugin.json`
   - the `machinemail` entry in `.claude-plugin/marketplace.json`
3. Add a `## [<version>] - YYYY-MM-DD` section to the top of `CHANGELOG.md`, with today's date, and a link reference at the bottom:

   ```markdown
   [<version>]: https://github.com/machinemail/agent-plugin/compare/v<previous>...v<version>
   ```

   The release notes are that section, followed by install instructions.
4. Check and build locally:

   ```shell
   node scripts/check.mjs
   node scripts/package.mjs
   node scripts/release-notes.mjs v<version>
   ```

5. Merge the change to `main` and wait for the **Validate plugin** workflow to pass.
6. Tag the commit on `main` and push the tag:

   ```shell
   git checkout main && git pull
   git tag -a v<version> -m "MachineMail agent plugin <version>"
   git push origin v<version>
   ```

7. Watch the **Release** workflow in the Actions tab. When it finishes, the release is published at `https://github.com/machinemail/agent-plugin/releases/tag/v<version>` and the `releases/latest/download/` links in the README point at it.

## What the workflow checks

- The tag equals the version in `plugin.json`. `scripts/check.mjs` checks that `.claude-plugin/plugin.json`, the marketplace entries and `CHANGELOG.md` agree with it. Normal CI runs the same check, so the versions cannot drift between releases.
- The same validation as every push: JSON Schemas, `skills-ref` and `scripts/check.mjs`.
- Building twice gives identical bytes.
- `SHA256SUMS` matches, the unzipped plugin passes `scripts/check.mjs` and matches the repository, and each skill zip holds `<name>/SKILL.md` at the top.

If a step fails, no release is created. Fix the problem on `main`, then move the tag to the fixed commit:

```shell
git tag -d v<version> && git push origin :refs/tags/v<version>
```

and tag again. Do not move a tag after its release is published. Release a new patch version instead.

## Dry run

Run the **Release** workflow by hand from the Actions tab (**Run workflow**, on any branch). It validates, builds and checks the zips, and uploads them as the `release-assets` workflow artifact. It does not create a release.

## What is in the zips

`scripts/package.mjs` writes `dist/`:

- `machinemail-agent-plugin.zip`: `plugin.json`, `mcp.json`, `skills/`, `assets/`, `README.md`, `LICENSE`, `CHANGELOG.md`, and the client files `.claude-plugin/`, `.mcp.json` and `.agents/`, all inside a `machinemail/` folder. The Agent Plugins Specification defines a plugin as a directory with `plugin.json` at its root, and does not define an archive format. A single top-level folder named after the plugin means unzipping gives exactly that directory, ready to place in a client's plugin folder or add as a local marketplace.
- `machinemail-skill-<name>.zip` for each skill: the `<name>/` folder with its `SKILL.md`. This is the layout claude.ai and Claude Desktop accept for skill upload: the skill folder at the top of the zip, named like the skill.
- `SHA256SUMS` and `manifest.json` (name, version, tag, commit, and each zip's size and sha256).

The zips are reproducible. Entries are sorted, every timestamp is 1980-01-01 00:00, permissions are fixed and there are no extra fields, so the same commit always gives the same bytes.
