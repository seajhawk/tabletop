# Local toolchain

Verified 2026-11-19. Paths are local conveniences, not global prerequisites.

| Tool | Observed state |
| --- | --- |
| Node / npm | 26.8.1 / 11.4.1 |
| .NET SDK | 8.0.428; not required by the GDScript prototype |
| Claude Code | 2.1.302; initial `claude.exe auth status` reported `loggedIn: false`, `authMethod: none` |
| agy | 1.5.7; `agy.exe models` successfully fetched an available-model catalog |
| Copilot CLI | 1.0.107; configured model `auto`; inference/authentication not checked by this audit |
| Godot standard | Portable 4.7.2, validated output `4.7.2.stable.official.ed1daf0bf` |

## Portable Godot

The [official Windows download page](https://godotengine.org/download/windows/)
listed stable 4.7.2. The [official release](https://github.com/godotengine/godot-builds/releases/tag/4.7.2-stable)
metadata confirmed publication on 2026-08-18. Downloaded the
[Windows x64 standard archive](https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_win64.exe.zip)
to `.tools/Godot_v4.7.2-stable_win64.exe.zip` and extracted under `.tools/godot-4.7.2/`.
No administrator privileges, global installation, or export templates were used.

Verified archive SHA256 against the official GitHub release asset digest:
`731980f9608d61333e5baf54a2ef17210acc7a538446c0cb9969f002aca1e953`.
The entire `.tools/` directory is ignored by Git.

From the repository root in PowerShell:

```powershell
# Headless import/parse check, once the project exists:
& '.\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe' --headless --path proto-godot --editor --quit

# Run the prototype:
& '.\.tools\godot-4.7.2\Godot_v4.7.2-stable_win64.exe' --path proto-godot
```

## Bounded delegation

Refresh authentication and catalog before selecting a worker. A model being
listed does not prove quota or successful inference. Initial agy catalog includes
`claude-sonnet-5-5-high`, `claude-opus-5-5-high`, `gemini-4-neon-high`,
`gemini-4-argon-high`, `gemini-3.8-flash-medium`, and `gpt-oss-120b-medium`.

```powershell
agy.exe --model claude-sonnet-5-5-high --mode accept-edits --print-timeout 10m --output-format json -p 'Read AGENTS.md. Perform only the assigned task.'

# After standalone Claude authentication is available:
claude.exe --model sonnet --permission-mode acceptEdits --permission-prompts none --allowedTools 'Bash(npm *)' 'Bash(node *)' --output-format json -p 'Read AGENTS.md. Perform only the assigned task.'

# Specify a verified underlying model when using Copilot for an actual task:
copilot.exe --trust-folder --allow-tool 'write(proto-web/**)' --allow-tool 'shell(npm:*)' --no-ask-user --max-ai-credits 30 -p 'Read AGENTS.md. Perform only the assigned task.'
```

`accept-edits` can still deny shell steps; the coordinator can run scoped checks.
Copilot's 30-credit minimum cap is soft, not a hard spend ceiling. Claude's
`--max-budget-usd` is an API-call cap, not a subscription-quota control.
No paid resources were created and no subscription quota was inferred.

### agy headless permissions

Initial workers returned an empty response plus `denied_actions` for `Bash`,
despite JSON `status: SUCCESS`; inspect response and denials, not exit code alone.
Prefer built-in file tools for delegates and coordinator-run build commands.
The [official permission reference](https://antigravity.google/docs/permissions/?tab=cli)
documents `permissions.allow`, `permissions.ask`, and `permissions.deny`, evaluated
in deny > ask > allow order. The CLI's global file is
`C:/Users/chris/.gemini/antigravity-cli/settings.json`; `--settings <file>` accepts
a session-only override. Preserve existing deny/ask rules in any override.
Use only exact task commands, e.g. `command(npm --prefix D:/git/tabletop/ga/proto-web run build)`;
Windows commands that cannot be tokenized require an exact full-line match or
`regex:`. Directory grants are recursive, e.g. `write_file(D:/git/tabletop/ga/proto-web)`.
Do not replace scoped rules with an all-tools permission bypass.
Official [settings schema](https://antigravity.google/schemas/v1/settings.json).
