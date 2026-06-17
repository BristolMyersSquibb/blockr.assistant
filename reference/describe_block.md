# Describe a block for the LLM

Generic backing the `describe_block` assistant tool. The default method
`describe_block.block` reports the block's class, name, arguments,
external-control declaration, and incoming links. The bulk of the
description comes from
[`base::format()`](https://rdrr.io/r/base/format.html) on the block;
incoming links are computed from the board snapshot supplied alongside.
Block authors override their class when the default isn't enough.

## Usage

``` r
describe_block(x, board, id, ...)

# S3 method for class 'block'
describe_block(x, board, id, ...)
```

## Arguments

- x:

  A `block`.

- board:

  The current board snapshot, for resolving link metadata.

- id:

  The id under which the block lives on the board (the name attribute of
  the enclosing `blocks` object – block objects themselves do not carry
  an id because ids must be unique while block-level fields are
  user-supplied and need not be).

- ...:

  For future use.

## Value

Character vector of lines (consistent with `summarise_result()` and
[`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md)).
The tool that consumes this collapses with `paste(..., collapse = "\n")`
before returning to ellmer.
