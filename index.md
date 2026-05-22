# blockr.assistant

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
[`ellmer::chat_openai()`](https://ellmer.tidyverse.org/reference/chat_openai.html));
set the `blockr.chat_function` option to swap providers.

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

![Assistant panel mounted next to a small blockr.dock
board.](reference/figures/01-shell.png)

Assistant panel mounted next to a small `blockr.dock` board.

## Roadmap

The assistant is in **Phase 1**: it can hold a conversation, but it has
no tools to inspect or manipulate the board yet. See the
[roadmap](https://bristolmyerssquibb.github.io/blockr.assistant/articles/design/0-roadmap.html)
for the staged plan and the [Phase 1 design
notes](https://bristolmyerssquibb.github.io/blockr.assistant/articles/design/1-shell.html)
for what is currently shipped.
