# Galactic Alliance — agent entry point

Read this, `STATUS.md`, then only the relevant parts of `docs/GAME-DESIGN.md`.
All coordinating agents must follow these instructions regardless of provider.

## User priorities

- Build a cooperative, multi-touch tabletop tower-defense game. Begin with two quick,
  comparable prototypes: TypeScript/Vite/PixiJS v8 and Godot 4/GDScript.
- Act as coordinator: delegate bounded tasks, inspect results, integrate, and verify.
- Conserve the user's small OpenAI/Codex allowance; no resets are available.
- Claude CLI has the user's largest token allowance. Prefer it for bulk work when
  authenticated. `claude.exe`, `agy.exe`, and `copilot.exe` are authorized task tools.
- Choose the best available model for each task using `docs/MODEL-ROUTING.md`.
  Model access, included quota, and context capacity are different things. Verify
  actual CLI models/authentication; never assume product names imply a model.
- Azure Foundry offers additional models but costs money per token. Prefer it for
  affordable open-weight models, narrowly scoped tasks, and only after checking
  actual deployment, pricing, and a bounded spend. Do not create paid resources
  or run open-ended paid agents merely because Foundry is available.
- The coordinator may change with token availability. Keep handoffs small and current.
- After being stalled by quota/usage limits, the VERY FIRST action on restarting
  work is to set the next reminder for FIVE HOURS FROM THAT RESTART. Update the
  existing Codex heartbeat `continue-galactic-alliance`; do not create duplicates.
  Use a relative five-hour timer, NEVER a fixed daily time (11:45 daily is explicitly
  rejected). Do this before reading the handoff or starting any implementation.
  Ordinary messages during uninterrupted work are not quota restarts. Use the app
  automation tool, not raw automation files. Preserve this rule across coordinators.

## Routing defaults

- Claude Sonnet: bulk implementation, scaffolding, documentation, routine fixes.
- Claude Opus: difficult architecture or a blocker Sonnet cannot resolve; narrow scope.
- Google Gemini through `agy.exe`: independent review, visual critique, bounded
  implementation when Claude is unavailable; select a listed model explicitly.
- OpenAI Codex: coordination, integration, focused verification, difficult targeted
  review; use sparingly. Use built-in subagents only for bounded parallel work.
- Microsoft Copilot CLI: an alternate access channel hosting multiple providers;
  specify the underlying model and check entitlement. Do not call it a model.
- Paid open-weight Foundry models: routine transformations or second-pass review
  when economical; never assume the smallest model can safely own integration.
- If authentication or quota fails, record it and use the next verified route.
  Do not repeatedly retry, silently purchase quota, or claim a delegate ran when it did not.

## Handoff discipline

- Keep `STATUS.md` under approximately 80 lines. Replace stale state instead of
  appending a diary. Update after a milestone, a blocker, and before yielding.
- Record current objective, completed artifacts, exact checks/results, running
  worker/session identifiers, blockers, and the next 3–5 concrete actions.
- A delegate owns only explicitly assigned paths. Avoid simultaneous edits to
  shared contracts. Workers report files changed, checks run, and remaining gaps.
- Put durable decisions in `docs/`; keep verbose CLI logs under ignored `.tasks/`.
- Do not reread the whole repository or repeat successful checks without a reason.
- Treat the design brief as intent, not evidence that systems are implemented.

## Engineering boundaries

- `shared-data/` is the canonical JSON contract for both prototypes. No divergent
  balance copies. See `docs/PROTOTYPE-CONTRACT.md` for schema and parity scope.
- Fixed simulation at 60 Hz; independent input state per finger/pointer ID.
- Validate placement against every spawn AND every live ground enemy. Revalidate
  on drop, including concurrent drops; never allow complete walling or overspending.
- Build canvas/Node2D docks with three layouts. Never introduce single-pointer UI
  state that breaks simultaneous players. Clear interactions on cancellation/focus loss.
- Use procedural visuals. Keep simulation independent from rendering.
- Run meaningful simulation/input checks and build/parse checks. Record real
  hardware multi-touch, performance, DPI, and native export as unverified until tested.
- Do not copy reference-repository code without checking provenance and license.
- Keep scope lean: postpone advanced roster, flick sharing, full radial menus,
  particles, and native packaging until the initial stack comparison warrants them.
- Never expose credentials in logs, commit generated dependencies, or deploy/publish
  externally without authorization. Normal local implementation and verification are authorized.
