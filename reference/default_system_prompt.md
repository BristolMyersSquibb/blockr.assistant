# Default assistant system prompt

The package-default persona used when
[`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md)
is called without a `system_prompt` argument. The text deliberately
tells the model it cannot yet act on the board — Phase 1 ships no tools,
and without an explicit instruction the model will happily hallucinate a
CRUD vocabulary it does not have.

## Usage

``` r
default_system_prompt()
```

## Value

A character scalar.
