
<!-- README.md is generated from README.Rmd. Please edit that file -->

# blockr.assistant

<!-- badges: start -->

[![lifecycle](https://img.shields.io/badge/lifecycle-experimental-orange.svg)](https://lifecycle.r-lib.org/articles/stages.html#experimental)
[![status](https://github.com/BristolMyersSquibb/blockr.assistant/actions/workflows/ci.yaml/badge.svg)](https://github.com/BristolMyersSquibb/blockr.assistant/actions/workflows/ci.yaml)
[![coverage](https://codecov.io/gh/BristolMyersSquibb/blockr.assistant/graph/badge.svg?token=TxIZnzIqo2)](https://app.codecov.io/gh/BristolMyersSquibb/blockr.assistant)
<!-- badges: end -->

An [`ellmer`](https://ellmer.tidyverse.org/)-powered chat panel for
[`blockr.dock`](https://github.com/BristolMyersSquibb/blockr.dock)
boards. The assistant ships as a `dock_extension` that slots into the
board layout like any other panel; the chat UI is built on
[`shinychat`](https://github.com/posit-dev/shinychat).

## Installation

You can install the development version of blockr.assistant from
[GitHub](https://github.com/) with:

``` r
# install.packages("pak")
pak::pak("BristolMyersSquibb/blockr.assistant")
```

## Example

Mount the assistant on a small board. The chat is wired to whichever
`ellmer` model the board’s `llm_model` option resolves to (by default
`ellmer::chat_openai()`); set the `blockr.chat_function` option to swap
providers.

``` r
library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris"),
    head = new_head_block(),
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

<figure>
<img src="man/figures/01-shell.png"
alt="Assistant panel mounted next to a small blockr.dock board." />
<figcaption aria-hidden="true">Assistant panel mounted next to a small
<code>blockr.dock</code> board.</figcaption>
</figure>

## Status

The assistant is feature-complete for the initial roadmap: read tools
(`list_blocks`, `describe_block`, `query_data`, …), mutation tools
(`add_block`, `modify_block`, …) flushed atomically per turn, and a
system prompt refreshed on every materialized board change so the model
always sees the current shape of the board.

See the
[roadmap](https://bristolmyerssquibb.github.io/blockr.assistant/articles/design/0-roadmap.html)
for the staged plan and the per-phase design notes for what was shipped
in each phase.
