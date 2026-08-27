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

  Either a function (called each refresh with `(board, client, ...)` to
  build the prompt) or a character scalar (used verbatim, no refresh).
  Defaults to the exported
  [default_system_prompt](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  function.

- messages:

  Optional list of recorded turns (as produced by
  [`ellmer::contents_record()`](https://ellmer.tidyverse.org/reference/contents_record.html))
  to seed the conversation with on server start. `NULL` starts with an
  empty conversation. This is also how a restored board seeds the chat
  it was saved with.

- ...:

  Forwarded to
  [`blockr.dock::new_dock_extension()`](https://bristolmyerssquibb.github.io/blockr.dock/reference/extension.html).

## Value

A `dock_extension` object additionally inheriting from
`assistant_extension`.

## Details

The `system_prompt` argument controls the prompt the model sees:

- A **function** is called on every refresh with `(board, client, ...)`
  and must return a character scalar. The default
  [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  composes a four-section prompt (intro / tool catalogue / skill
  catalogue / board summary); a caller can pass any function of the same
  shape.

- A **character scalar** is used verbatim as a static prompt – no
  refresh, no auto-appended catalogue or board summary. The deal is
  "give up dynamic context, gain full prompt control". Block- and
  extension-scoped skills are unaffected: those ride in tool return
  values rather than the prompt.

The `state` shape mirrors the constructor: `system_prompt` (when the
caller passed a string) round-trips through `blockr.dock`'s ser/des.
Function-valued `system_prompt` is omitted from `state` so restore falls
back to the constructor default (functions don't serialise robustly
across sessions).

The conversation is saved alongside it and restored into the chat when
the board is reopened. How many of the most recent turns are written is
read at save time from the `blockr.chat_save_turns` option (or the
`BLOCKR_CHAT_SAVE_TURNS` environment variable), which takes `0` for
none, a positive whole number, or `Inf` for all, and defaults to 50.
Setting it to `0` is worth considering where boards are shared, since
the file otherwise carries whatever was typed into the chat. It
describes the deployment rather than the board, so it is neither a
constructor argument nor part of `state` – restore reads whatever the
file holds.

Turns are stored as an opaque
[`jsonlite::serializeJSON()`](https://jeroen.r-universe.dev/jsonlite/reference/serializeJSON.html)
blob. Recorded turns written into `state` directly do not survive the
board's JSON round trip –
[`ellmer::contents_replay()`](https://ellmer.tidyverse.org/reference/contents_record.html)
rejects the integer `version` that comes back, and typed props such as
`tokens` return as lists – and since the replay happens in a
board-server observer, such a board took the whole session down on
restore rather than just the chat panel. Payloads written in that
earlier shape are dropped on deserialisation. The raw provider response
is stripped before saving, and the saved window is trimmed to whole
exchanges so it never opens or closes on half of a tool call.

The live conversation is bounded separately, since saving bounds only
the file: every turn is re-sent on every request, so an unbounded
session costs more as it goes and eventually exceeds the provider's
context window – and because that limit is reached by accumulation,
every later message is over it too, leaving the chat dead until the
extension is remounted. Once an exchange exceeds the threshold, the
older part of the conversation is replaced by a summary the model writes
of it, and the recent turns are kept verbatim. The threshold counts what
the provider itself billed for the last exchange rather than turns, that
being what the context window is actually spent in. A restored board is
checked on mount as well, so reopening a long conversation cannot land
already over the limit.

That threshold is a **board option**, `chat_compact_tokens`, so a user
can retune it during a session – the trade is recall against how soon
the chat starts summarising, and the right answer moves with the model,
which is itself swappable at runtime. It defaults to `Inf`, which leaves
compaction **off**: a threshold that would suit one provider's context
window is wrong for another's, and nothing in the API reports that
window, so a number picked here would be a guess – silently inert on a
small-context model and needlessly destructive on a large one. A
deployment that knows its models sets the starting point through the
`blockr.chat_compact_tokens` option or the `BLOCKR_CHAT_COMPACT_TOKENS`
environment variable, and a user can pick a value for their own session.
Contrast `chat_save_turns`, which stays a deployment setting because it
governs whether conversations may land in a shared file at all – not a
decision to hand to the person whose conversation it is.

How much survives a compaction is the companion board option,
`chat_compact_keep` (deployment default `blockr.chat_compact_keep`, 8):
the count of most recent turns left verbatim, with everything older
becoming the summary. It is offered on doubling rungs to 256, since a
turn count needs no `Inf` and stops meaning much at the top – keeping
256 turns verbatim is already barely compacting. The figure is a
preference rather than a floor: a conversation that exceeds the
threshold in fewer turns than this is still compacted, or the bound
would be inert exactly where it is needed.

Compaction rewrites the browser transcript to match, which is what keeps
the two honest. `shinychat` appends each turn to the DOM as it arrives
and never reads the client back, so turns dropped from the client would
otherwise stay on screen unremembered. The same replay fills in a
transcript that a restore or a provider swap leaves empty; tool traffic
carries no text and is not replayed.

Both the conversation and its size are reachable from the chat's command
palette, which lists two built-in commands alongside the user-invocable
skills. The `/compact` command runs the same summarise-and-replace on
demand, without waiting for the threshold – for a thread that has gone
stale rather than large, where a long build has finished and the next
question is unrelated to it. The `/clear` command drops the conversation
outright: the browser transcript, the turns the model is sent, and any
changes staged but never committed go together, and the emptied chat
reopens on a greeting read off the board as it now stands.

## Examples

``` r
ext <- new_assistant_extension()
blockr.dock::is_dock_extension(ext)
#> [1] TRUE
```
