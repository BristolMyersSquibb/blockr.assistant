# Describe a block result for the LLM

Generic backing the result summaries the assistant feeds the model: the
`get_block_result` tool and the post-apply review it sends itself. The
default method delegates to
[`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html).
A package contributing an unusual result type can add a method to
describe it directly, in blockr terms, instead of supplying a
[`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html)
method.

## Usage

``` r
describe_result(x, ...)

# Default S3 method
describe_result(x, ...)
```

## Arguments

- x:

  A block result (any R object).

- ...:

  Passed on to methods (e.g.
  [`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html)).

## Value

Character vector of lines, consistent with
[`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)
and
[`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md);
the caller collapses with `paste(collapse = "\n")`.

## Details

Methods need not bound their output or guard their own errors: the
internal `summarise_result()` wrapper caps the text before it reaches
the prompt and turns a failed description into a surfaced error message.
It is what the tool and the review actually call.
