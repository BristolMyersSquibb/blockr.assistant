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

# S3 method for class 'evaluate_evaluation'
describe_result(x, ...)

# S3 method for class 'recordedplot'
describe_result(x, ...)

# S3 method for class 'source'
describe_result(x, ...)

# S3 method for class 'condition'
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

Methods for recorded plots ship here, since a plot block built on
[`blockr.core::new_plot_block()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_plot_block.html)
evaluates to recordings and the default renders their display list – a
list of graphics primitives, not a description of the chart. They name
the class and count the recordings, and say when a block evaluated
without drawing. Neither describes the chart itself: `inspect_results`
renders it, by drawing it on a device.

The
[`evaluate::evaluate()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/evaluate.r-lib.org/reference/evaluate.md)
method describes each component through the generic rather than reading
the container as one shape, so an evaluation mixing plots with output
and conditions is handled by whatever methods exist for its parts –
including ones another package adds. That is what keeps a warning's
message from being reduced to a count of warnings. To describe a whole
result differently, give it a class of its own and register a method on
that, which takes precedence over all of these.

Methods need not bound their output or guard their own errors: the
internal `summarise_result()` wrapper caps the text before it reaches
the prompt and turns a failed description into a surfaced error message.
It is what the tool and the review actually call.
