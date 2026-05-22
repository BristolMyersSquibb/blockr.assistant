# Assistant extension

Mounts an `ellmer`-powered chat panel on a `blockr.dock` board. Phase 1
wires the chat panel to an
[`ellmer::Chat`](https://ellmer.tidyverse.org/reference/Chat.html)
constructed from the board's `llm_model` option; the assistant has no
awareness of the board yet – tools and dynamic prompt context arrive in
later phases.

## Usage

``` r
new_assistant_extension(system_prompt = NULL, messages = NULL, ...)
```

## Arguments

- system_prompt:

  Character scalar overriding the package default persona returned by
  [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md).
  `NULL` uses the default.

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

The constructor signature mirrors the extension's `state` shape:
`system_prompt` and `messages` round-trip through `blockr.dock`'s
ser/des so that a saved board restores with the same persona and the
same conversation history. Model parameters (temperature, max tokens,
...) are deliberately not part of this surface – they belong to the chat
constructor, supplied via
`blockr.core::blockr_option("chat_function", ...)` or the board's
`llm_model` option.

## Examples

``` r
ext <- new_assistant_extension()
blockr.dock::is_dock_extension(ext)
#> [1] TRUE
```
