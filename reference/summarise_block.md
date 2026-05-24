# Summarise a block for the LLM prompt context

Generic backing the per-block lines in the dynamic system prompt's board
summary. The default method `summarise_block.block` returns a compact
one-line summary (id, class, current arg values, modifiable keys). Block
authors override their class when the default is too generic or too
verbose for prompt context.

## Usage

``` r
summarise_block(x, board, id, ...)

# S3 method for class 'block'
summarise_block(x, board, id, ...)
```

## Arguments

- x:

  A `block`.

- board:

  The current board snapshot, for resolving cross-references. May be
  `NULL` – currently unused by the default method, reserved for
  overrides that want to surface relationships.

- id:

  The id under which the block lives on the board.

- ...:

  For future use.

## Value

A single-line character scalar (preferred). Multi-line output is
accepted but inflates the prompt budget.

## Details

Parallel to
[`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)
(which produces the full multi-line description used by the
`describe_block` tool). Use `summarise_block` when token density
matters; use `describe_block` when the user has explicitly asked for
detail.
