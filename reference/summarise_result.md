# Summarise a block result for the LLM

Generic dispatch on the result's class. The default forwards to
[`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html),
which ships methods for data frames, tibbles, matrices, and falls back
to a truncated [`print()`](https://rdrr.io/r/base/print.html) for
everything else. Define methods to override the summary for specific
result classes (e.g. when `btw_this()` lacks a method or its output is
too verbose for token budgets).

## Usage

``` r
summarise_result(x, ...)

# Default S3 method
summarise_result(x, ...)
```

## Arguments

- x:

  A block result, as returned by the block's `result` reactive.

- ...:

  Passed to methods.

## Value

Character vector of lines.

## Details

Methods should keep their output bounded – roughly 1-2 KB of text per
call is a sensible ceiling. The LLM pays in tokens for every line
returned, and an unbounded
[`print()`](https://rdrr.io/r/base/print.html) of a large object will
both blow the budget and bury the relevant structural information in
noise. The default
([`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html))
truncates aggressively; overrides should too.

## Examples

``` r
summarise_result(head(iris))
#> [1] "| Sepal.Length | Sepal.Width | Petal.Length | Petal.Width | Species |\n|--------------|-------------|--------------|-------------|---------|\n| 5.1 | 3.5 | 1.4 | 0.2 | setosa |\n| 4.9 | 3.0 | 1.4 | 0.2 | setosa |\n| 4.7 | 3.2 | 1.3 | 0.2 | setosa |\n| 4.6 | 3.1 | 1.5 | 0.2 | setosa |\n| 5.0 | 3.6 | 1.4 | 0.2 | setosa |\n| 5.4 | 3.9 | 1.7 | 0.4 | setosa |"
```
