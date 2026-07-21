# Default assistant system prompt

Builds the four-section system prompt the assistant ships by default: an
intro / conventions block, an auto-generated tool catalogue from
`client$get_tools()`, a compact board summary, and (when applicable) a
one-line note carrying the previous turn's flush rejection.

## Usage

``` r
default_system_prompt(
  board = NULL,
  client = NULL,
  last_flush = NULL,
  view_data = NULL,
  ...
)
```

## Arguments

- board:

  Reactive containing the live board, as supplied to the extension
  server. `NULL` omits the board section.

- client:

  An [`ellmer::Chat`](https://ellmer.tidyverse.org/reference/Chat.html).
  `NULL` omits the tool catalogue.

- last_flush:

  Reactive holding the previous turn's flush rejection message
  (character) or `NULL`. `NULL` (or a `NULL` value) omits the delta
  note.

- view_data:

  Reactive holding `blockr.dock`'s live all-views layout (a
  `list(views, grids)`), as supplied to the extension server, or `NULL`.
  Read for the board section's view summary, falling back to the
  committed `board` when `NULL` (before every view has reported its
  layout).

- ...:

  Forward-compatibility slot for future inputs.

## Value

A character scalar.

## Details

Each argument is optional; the corresponding section is omitted when its
input is `NULL`, so `default_system_prompt()` at the REPL returns just
the intro block – useful for inspecting what the default looks like
without mounting a board.

This is the default value of `new_assistant_extension`'s `system_prompt`
argument. Custom functions passed in its place receive
`(board, client, last_flush, ...)`; the `...` is forward-compatibility
headroom for future phases adding inputs (accept `...` in custom
functions so the call site can grow without breaking you).
