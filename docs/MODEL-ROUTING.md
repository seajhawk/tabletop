# Model routing

Researched **2026-11-19**. Recheck availability and pricing when changing providers. These are task-routing recommendations based on current vendor documentation and local tool metadata, **not a benchmark of this game**.

## Operating preference

1. Use **Claude Sonnet 5.5 for bulk implementation** through the user's included allowance. Claude has the largest available token allocation according to the user. Give it complete, bounded work packages and let it implement, run checks, and repair failures.
2. Escalate difficult architecture/debugging to **Claude Opus 5.5**; consider Fable 5.2 only if available and justified by an unresolved hard task.
3. Conserve **OpenAI/Codex quota** for concise coordination, integration decisions, and independent checks. Do not duplicate a full implementation with another expensive model.
4. Use **Gemini** for independent design/visual review or an implementation fallback; **Copilot** for bounded repairs/reviews when its available allowance is favorable.
5. Use paid **Azure Foundry primarily for affordable open-source/open-weight models** and small, measurable jobs. Verify the exact deployment's rate, license, tool support, and output limit first; a small model is not automatically cheaper after retries or dedicated compute charges.

## Strengths, tradeoffs, and assignments

| Provider and verified model names | Evidence-based strengths | Limits / project recommendation |
| --- | --- | --- |
| Anthropic: `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-2`, `claude-haiku-5-5` | Sonnet balances speed/intelligence; Opus targets sustained agentic coding; Fable targets demanding reasoning; Haiku targets fast, high-volume work. | Route prototype implementation to Sonnet, hard blockers to Opus, mechanical summaries to Haiku. More capable tiers have higher API prices/latency; included-plan consumption must be checked separately. [Anthropic catalog](https://platform.claude.com/docs/en/models/overview) |
| OpenAI: `gpt-6.2-sol`, `gpt-6.2-astra`, `gpt-6.1-terra`, `gpt-6-luna` | Sol balances intelligence/cost; Astra targets complex reasoning/coding; Terra specializes in visual reasoning/computer use; Luna targets focused, high-volume tasks. | Use Sol sparingly for integration, Astra for an unresolved correctness question, Terra for screenshot/UI checks, Luna for narrow transformations. User's OpenAI allowance is scarce; nominal API efficiency does not establish included quota cost. [OpenAI catalog](https://developers.openai.com/api/docs/models) |
| Google: `gemini-4-hydrogen`, `gemini-4-argon`, `gemini-4-neon`, `gemini-4-carbon` | Hydrogen targets efficient everyday coding; Argon reduces token spend versus Carbon; Neon targets fast completion of complex tasks; Carbon targets the hardest reasoning/software work. All accept multimodal inputs. | Prefer Hydrogen for bounded edits, Neon/Argon for broader review, Carbon only for a justified hard task. A 1M context ceiling is not a reason to send the entire repository; CLI exposure and quota vary. [Google catalog](https://aistudio.google.com/docs/models) |
| Microsoft: **MAI Code 2**, **MAI Code 2 Flash** (product names; CLI IDs not locally verified) | Code 2 targets multi-file development, debugging and UI; Flash targets routine changes, explanations and rapid iteration. | Candidate Copilot fallbacks for practical implementation/review. Microsoft explicitly says this family is not tuned for very long-horizon agency or fundamental science. Vendor price/performance claims include promotional assumptions; do not extrapolate them to this game. [Microsoft announcement](https://microsoft.ai/news/introducing-mai-code-2-and-mai-code-2-flash/) |
| Microsoft open-weight: `Phi-4-mini-instruct`, `Phi-4-reasoning` | Small-model options for constrained reasoning, text transformation and focused math checks. | Use for JSON/content cleanup or isolated algorithm reasoning, not autonomous ownership of a prototype. Mini has a small factual knowledge capacity; documented Foundry variants have limited output/tool support. [Mini model card](https://ai.azure.com/catalog/models/Phi-4-mini-instruct), [Foundry capabilities](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-from-partners) |
| Open-weight Foundry candidate: `gpt-oss-20b`, `gpt-oss-120b` | Text reasoning, structured output and function calling are documented. | Evaluate 20B for small transformations; 120B for a bounded coding/reasoning job only when its actual deployment is economical. Text-only; deployment options differ and availability tables must be checked for the selected endpoint. [Foundry catalog](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure?pivots=azure-direct-others) |

## Tools are not models

- `claude.exe` is Claude Code; its `--model sonnet`/`opus` aliases can change. Prefer an explicit verified model ID for reproducible delegation.
- `agy.exe` exposes multiple providers; **do not assume every agy task uses Gemini** or consumes the same allowance as Claude Code.
- `copilot.exe` is GitHub Copilot CLI, a multi-provider agent. Selecting Claude/GPT/Gemini there does not make it a Microsoft-built model. Availability depends on plan/client, and credits vary by model and context/effort. [Copilot model support](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
- Foundry is a paid hosting/catalog service, not one model. Open weights do not imply free inference or an unrestricted open-source license.

## Local availability snapshot

This snapshot records discovery, not a guarantee that an inference request succeeds. See `STATUS.md` for later changes.

| Surface | Observed on 2026-11-19 |
| --- | --- |
| Codex installed metadata | `models_cache.json` advertises `gpt-6.2-sol`, `gpt-6.2-astra`, `gpt-6.1-terra`, `gpt-6-luna`, among others. Local context settings differ from API maximums; neither describes remaining quota. |
| Claude Code 2.1.302 | Installed. Initially signed out; user authenticated during setup. Direct `claude-sonnet-5-5` inference now verified; Claude Code is the active implementation route. |
| agy model catalog | `agy models` succeeds. Advertises `claude-sonnet-5-5-medium`, `claude-opus-5-5-medium`, `gemini-4-hydrogen-medium`, `gemini-4-argon-medium`, `gemini-4-neon-medium`, `gemini-3.8-flash-medium`, and `gpt-oss-120b-medium`, with other effort variants. These are **agy IDs**, distinct from base API IDs above. A Sonnet probe succeeded; initial build runs hit headless command permissions and stopped before source edits. |
| Copilot CLI 1.0.107 | Installed; accepts `--model`. No inference or account entitlement established by help output alone. |
| Azure Foundry | User reports access. No paid invocation or deployment made for this research. |

## Delegation and handoff discipline

- A work package names owned paths, inputs, acceptance criteria, permitted commands, and a short completion-report format. Avoid overlapping writers.
- Pass `AGENTS.md`, `STATUS.md`, relevant design/data contracts, and only necessary code. Ask for changed files, checks/results, blockers, and next action; keep raw logs out of handoff context.
- Prefer one implementation owner plus targeted independent verification. Escalate after a concrete failing check or repeated failed repair, not simply because a bigger model exists.
- When a tool is unavailable or quota-limited, record the failure and switch to an already available provider with a bounded task. Never silently substitute paid frontier API usage for included capacity.
- Before ending coordination, refresh `STATUS.md` with current truth, active jobs/model identifiers, verification evidence, and the next few actions. Keep it concise enough for a different coordinator to start immediately.


