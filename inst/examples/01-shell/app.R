library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

options(
  blockr.chat_function = function(system_prompt = NULL, params = NULL) {
    ellmer::chat_anthropic(system_prompt = system_prompt, params = params)
  }
)

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
