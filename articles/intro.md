# Get started with blockr.assistant

`blockr.assistant` mounts an LLM chat panel alongside a
[`blockr.dock`](https://github.com/BristolMyersSquibb/blockr.dock)
board. The chat is powered by [`ellmer`](https://ellmer.tidyverse.org/)
and [`shinychat`](https://posit-dev.github.io/shinychat/); the assistant
sees the board’s current state through a refreshed-each-turn system
prompt and can read or modify the board via a registered tool surface.

## Mount it on a board

``` r

library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris"),
    head = new_head_block(n = 10L),
    plot = new_scatter_block(x = "Sepal.Length", y = "Sepal.Width")
  ),
  links = c(
    new_link("data", "head", "data"),
    new_link("head", "plot", "data")
  ),
  extensions = list(assistant = new_assistant_extension()),
  layout = list(
    list("data", "head", "plot"),
    "assistant"
  )
)

serve(board)
```

That’s the whole setup. The assistant takes its chat client from the
board’s `llm_model` option (resolved by `blockr.core`’s `default_chat`
unless overridden), registers the read and mutation tools, and starts
the chat module.

## Talk to it

The system prompt the model receives on each new turn contains three
sections: a fixed intro / conventions block, the auto-generated tool
catalogue, and a compact board summary. Trivial questions land without a
tool round-trip:

> **You**: How many blocks are on the board?
>
> **Assistant**: There are three blocks: `data` (`dataset_block`),
> `head` (`head_block`), and `plot` (`scatter_block`).

Richer questions about a specific block trigger one drill-down call:

> **You**: What is `n_rows` on the head block?
>
> **Assistant**: \$\$calls \`describe_block(id = "head")\`\$\$ `n_rows`
> is currently 10.

Questions about a block’s data go through the `query_data` tool, which
evaluates R against an environment with every committed block result
bound by id:

> **You**: What are the unique species in the data block?
>
> **Assistant**: \$\$calls \`query_data(code =
> "unique(data\$Species)")\`\$\$ Three: setosa, versicolor, virginica.

Mutations stage across the turn and flush atomically when the assistant
finishes:

> **You**: Add a filter for `Sepal.Width > 3` between head and plot.
>
> **Assistant**: \$\$stages \`add_block(...)\`, \`add_link(...)\`,
> \`add_link(...)\`, flushes once\$\$ Added.

## Configure the model

The chat backend comes from a global option:

``` r

library(ellmer)
blockr.core::blockr_option(
  "chat_function",
  function(system_prompt = NULL, params = NULL) {
    chat_anthropic(model = "claude-sonnet-4-5", system_prompt = system_prompt)
  }
)
```

Any `ellmer::chat_*()` constructor that follows the standard
`(system_prompt, params)` shape will do. See [ellmer’s provider
matrix](https://ellmer.tidyverse.org/) for options and credential
handling.

## Customise the prompt

`new_assistant_extension(system_prompt = ...)` accepts either:

- a **string** – used verbatim as a static prompt, no refresh, no
  auto-appended board context. You take full control:

  ``` r

  new_assistant_extension(
    system_prompt = "You are a terse SQL coach. Refuse non-SQL."
  )
  ```

- a **function** – called each refresh with
  `(board, client, last_flush, ...)`, returning the prompt string. The
  default `default_system_prompt` composes the four-section default. To
  extend it, wrap and call through. Custom functions should accept `...`
  for forward-compatibility with future phases adding inputs.

``` r

my_prompt <- function(board, client, last_flush, ...) {
  paste(
    "ADDITIONAL RULE: prefer modify_block over remove + add",
    "when possible.",
    "",
    default_system_prompt(board, client, last_flush, ...),
    sep = "\n"
  )
}

new_assistant_extension(system_prompt = my_prompt)
```

You can call
[`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
with no arguments at the REPL to inspect just the intro block.

## Extend per block class

The package exports two S3 generics that let block / stack authors
customise the detailed descriptions the model can request on demand:

| Generic | Used by | When you’d override |
|----|----|----|
| `describe_block(x, board, id)` | `describe_block` tool | full description on user demand |
| `describe_stack(x)` | `list_stacks` tool description column | ditto for stacks |

The default methods report the class, name, arguments, external control
and incoming links; override them when your class carries extra state
worth surfacing.

The compact one-line-per-entity board summary in the dynamic system
prompt is produced internally, off blockr.core’s
[`str_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/str_value.html)
generic – the value-returning compact counterpart to
[`str()`](https://rdrr.io/r/utils/str.html), owned below this package –
not an assistant-specific generic. To influence how your block, stack or
layout renders there, define a
[`str_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/str_value.html)
method in its home package: the correct extension point and dependency
direction (the assistant sits above core / dock / dag, so it cannot own
a generic those packages would implement). A `dock_stack`’s colour
reaches the summary exactly that way.

A worked example overriding the detailed description for a bespoke block
class:

``` r

describe_block.fancy_block <- function(x, board, id, ...) {
  c(
    NextMethod(),
    "",
    sprintf("Rule semantics: %s", attr(x, "rule_doc"))
  )
}
```

## Where to go next

- [Roadmap](https://bristolmyerssquibb.github.io/blockr.assistant/articles/design/0-roadmap.md)
  for the design pillars of the initial release.
- The per-phase design notes under [Design
  notes](https://bristolmyerssquibb.github.io/blockr.assistant/) for
  contributors and for understanding the architectural decisions.
- [Issue
  tracker](https://github.com/BristolMyersSquibb/blockr.assistant/issues)
  for feature requests and bug reports.
