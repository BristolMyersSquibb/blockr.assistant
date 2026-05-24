# Assistant extension

Mounts an `ellmer`-powered chat panel on a `blockr.dock` board. The chat
client is built from the board's `llm_model` option and wired with the
read and mutation tools; the system prompt is refreshed on every
materialized board change so the model always sees the current shape of
the board.

## Usage

``` r
new_assistant_extension(
  system_prompt = default_system_prompt,
  messages = NULL,
  ...
)
```

## Arguments

- system_prompt:

  Either a function (called each refresh with
  `(board, client, last_flush, ...)` to build the prompt) or a character
  scalar (used verbatim, no refresh). Defaults to the exported
  [default_system_prompt](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  function.

- messages:

  Optional list of recorded turns (as produced by
  [`ellmer::contents_record()`](https://ellmer.tidyverse.org/reference/contents_record.html))
  to seed the conversation with on server start. `NULL` starts with an
  empty conversation.

- ...:

  Forwarded to
  [`blockr.dock::new_dock_extension()`](https://bristolmyerssquibb.github.io/blockr.dock/reference/extension.html).

## Value

A `dock_extension` object additionally inheriting from
`assistant_extension`.

## Details

The `system_prompt` argument controls the prompt the model sees:

- A **function** is called on every refresh with
  `(board, client, last_flush, ...)` and must return a character scalar.
  The default
  [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  composes a four-section prompt (intro / tool catalogue / board summary
  / optional flush-rejection note); a caller can pass any function of
  the same shape.

- A **character scalar** is used verbatim as a static prompt – no
  refresh, no auto-appended catalogue or board summary. The deal is
  "give up dynamic context, gain full prompt control".

The `state` shape mirrors the constructor: `system_prompt` (when the
caller passed a string) and `messages` round-trip through
`blockr.dock`'s ser/des. Function-valued `system_prompt` is omitted from
`state` so restore falls back to the constructor default (functions
don't serialise robustly across sessions).

## Examples

``` r
ext <- new_assistant_extension()
blockr.dock::is_dock_extension(ext)
#> [1] TRUE
```
