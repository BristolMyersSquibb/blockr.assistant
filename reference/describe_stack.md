# Describe a stack for the LLM

Generic backing the `description` column of the `list_stacks` tool. The
default method `describe_stack.stack` summarises the base stack fields
(name and comma-separated block ids). Stack classes that carry extra
attributes (e.g. `blockr.dag::dag_stack` with a colour) override their
class to surface those attributes.

## Usage

``` r
describe_stack(x, ...)

# S3 method for class 'stack'
describe_stack(x, ...)
```

## Arguments

- x:

  A `stack`.

- ...:

  For future use.

## Value

Character vector of lines (consistent with
[`summarise_result()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/summarise_result.md)
and
[`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)).
The tool that consumes this collapses with `paste(..., collapse = "\n")`
before returning to ellmer.
