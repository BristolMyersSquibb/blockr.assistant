# Summarise a stack for the LLM prompt context

Generic backing the per-stack lines in the dynamic system prompt's board
summary. The default method `summarise_stack.stack` returns a compact
name + member-blocks line. Stack classes that carry extra attributes
(e.g. `blockr.dag::dag_stack` with a colour) override their class to
surface those attributes.

## Usage

``` r
summarise_stack(x, ...)

# S3 method for class 'stack'
summarise_stack(x, ...)
```

## Arguments

- x:

  A `stack`.

- ...:

  For future use.

## Value

A single-line character scalar (preferred). The caller in
`summarise_board()` prepends the stack's id.

## Details

Parallel to
[`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md)
(full description, used by the `list_stacks` tool's description column).
Use `summarise_stack` when token density matters.
