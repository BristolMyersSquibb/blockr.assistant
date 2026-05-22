# Default assistant system prompt

The package-default persona used when
[`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md)
is called without a `system_prompt` argument. Names the read-only
inspection tools so the model knows to prefer them over guessing about
the board. Mutation tools arrive in a later phase; the prompt is
explicit about the current ceiling so the model does not invent CRUD
calls.

## Usage

``` r
default_system_prompt()
```

## Value

A character scalar.
