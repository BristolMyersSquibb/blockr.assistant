# Describe a board for the LLM

Generic backing the system prompt's board summary. The default method
`describe_board.board` reports the board's blocks, links, stacks and
options; `describe_board.dock_board` adds the view and extension
summaries via [`NextMethod()`](https://rdrr.io/r/base/UseMethod.html).
Board sub-classes extend the summary by supplying their own method.

## Usage

``` r
describe_board(b, markers, view_data = NULL, ...)

# S3 method for class 'board'
describe_board(b, markers, view_data = NULL, ...)

# S3 method for class 'dock_board'
describe_board(b, markers, view_data = NULL, ...)
```

## Arguments

- b:

  A `board`.

- markers:

  Named character vector of per-block condition markers (e.g. "1
  error"), as produced by `block_condition_markers()`.

- view_data:

  Reactive holding blockr.dock's live all-views layout, or `NULL` to
  read views from the committed board. Consulted only by the
  `dock_board` method.

- ...:

  Generic consistency.

## Value

Character vector of lines, collapsed with `paste(..., collapse = "\n")`
by `summarise_board()`.
