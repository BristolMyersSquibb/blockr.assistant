# Discovery — blockr.ai vs blockr.assistant: harness & tool-calling

Findings from re-testing the CEDX assistant flow on gpt-5.1 (prod) in June 2026.
Two LLM harnesses exist in the blockr stack; they do different jobs, but the
assistant repeatedly hits problems blockr.ai already solved. This documents the
head-to-head and what each can take from the other.

## What each one is

- **blockr.ai** — per-block AI config. `discover_block_args()` /
  `discover_via_ellmer_tools()` turn one natural-language phrase into the
  arguments for **a single block**. Validation is a tool; ellmer drives the
  loop; the last valid config is the apply.
- **blockr.assistant** — board-building chat. Read + mutation tools let the
  model assemble/edit a **whole board** (blocks + links + stacks + views).
  Mutations are staged and flushed at turn end.

## Side-by-side

| Dimension | blockr.ai | blockr.assistant |
|---|---|---|
| Scope | one block | whole board (blocks, links, stacks, views) |
| Tools | 2: `data_tool` (explore input), `validate_config` (propose → result) | ~16: read (`list_available_blocks`, `describe_block`, `get_block_result`, `get_block_conditions`, `query_data`, `list_links/stacks`) + mutate (`add/remove/modify` × block/link/stack) |
| Control loop | validation **is** a tool; native ellmer loop; last valid = apply | mutations **stage** into a pending payload; **flush at turn end** |
| Arg encoding | **typed** — params as native ellmer schema (`param-schema.R`: `block_param_types` → `ellmer_type_from_value`/`_from_default`); registry `examples` drive shapes; JSON-string fallback | single **`args` JSON string** (untyped); field names must match by convention |
| Unknown args | rejected with the valid list (`core_run`) | rejected with the valid list (added June 2026) |
| Arg shape hint | typed schema + example | `example` JSON column in `list_available_blocks` (added June 2026) |
| Link wiring | n/a (single block) | `add_link`; needs input-slot names — now surfaced via `inputs` column (added June 2026) |
| Feedback after a proposal | **`preview`** (`data_schema(result)`) **+ `effect`** (`config_effect`/`data_effect`: rows/cols changed, or "UNCHANGED") | **none** — model can't see what a staged block produced until a later `get_block_result`/`query_data` |
| dm handling | `data_effect.dm` + `effect_tables()`/`dm_get_tables()`; **no `data_schema.dm`** | `summarise_result.dm` + `query_data` dm guidance (added June 2026, copied from blockr.ai `effect_tables`) |
| Tool-call telemetry | `on_tool_request`/`on_tool_result` → contentful badges | tool results are plain strings |
| Token thrift | first-turn-only schema dump | full board summary each turn |

## What blockr.assistant should take from blockr.ai

| Priority | Lesson | Source in blockr.ai | Fixes |
|---|---|---|---|
| **High** | **Typed tool calling** for `add_block`/`modify_block` — params as a native ellmer schema so the API enforces names/shapes instead of the model hand-building a JSON string. | `R/param-schema.R` (`block_param_types`, `ellmer_type_from_value/_from_default`) | the whole arg-guessing class at the source |
| **High** | **Effect/preview in the mutation loop** — a dry-run that returns the staged block's `preview` + `effect` ("254×48", "UNCHANGED", "empty") so the model sees a misconfig in-loop. | `new_validate_tool` `core_run` (`data_schema` + `config_effect`/`data_effect`) | silent-misconfig (chart with no drill, empty Table 1) |
| Medium | **Reuse the describe/effect generics** instead of a parallel `summarise_result` + a copied dm helper. | `data_schema`, `data_effect`, `config_effect` | duplication / drift |

## What blockr.ai should take from blockr.assistant

| Lesson | Why |
|---|---|
| Input/relationship awareness (`inputs` surfacing, board structure) | if blockr.ai ever composes >1 block it needs link semantics |
| `get_block_conditions` (block-health markers) | blockr.ai only sees errors inline in `validate`, not board-level health |

## The real signal: converging, so share a layer

Both packages **independently reimplemented unknown-arg rejection**, and the
**dm description now lives in three places**: blockr.ai has `data_effect.dm` but
**no `data_schema.dm`**; blockr.assistant just copied `effect_tables` into
`dm_result_tables` (marked "COPIED FROM blockr.ai — delete when shared"). The
clean end-state:

1. A shared describe/validate layer (`data_schema` + `data_effect` +
   the unknown-arg validator) that **both** harnesses consume.
2. Add the missing **`data_schema.dm`** there (lists tables + per-table
   columns); both harnesses get dm-awareness for free.

Until that lands, the assistant's `dm_result_tables` copy must be kept in sync
with blockr.ai's `effect_tables`.

## Evidence (gpt-5.1, headless)

- Silent arg swallow: iris + bar chart passed 11 nonexistent chart args, 0
  errors, chart had no drill/sort. After validation + example surfacing: 23/23
  real args, first try.
- Link wiring: 7 clinical-intent prompts went from mostly **0 links** (model
  invented `input="dm_in"`) to fully wired (e.g. dropouts 6→32 links, 0 errors)
  after surfacing input slots.
- dm blindness: with the dm on the board the model still refused ("adsl not
  found") until `summarise_result.dm` + `query_data` dm guidance.

Harnesses: `blockr.ideas/07-research/pharma/cedx-explorer-demo/eval-*.R`,
`/tmp/eval-iris-chart.R`.
