# Dev launcher for the command-style assistant demo.
#
# Same as inst/examples/command-demo/app.R, but load_all()s the WORKING-TREE
# packages so it picks up uncommitted branch code (the immediate-commit B1
# feature) without installing anything. Serves on 3838 (the devcontainer's
# only forwarded port).
#
#   Rscript blockr.assistant/dev/run-command-demo.R
#
# Then open http://localhost:3838 and try, one line at a time:
#   - "add a scatter plot of Sepal.Length vs Petal.Length coloured by Species"
#   - "summarise the mean of every measurement by Species"
#   - "filter the data to rows where Sepal.Length is greater than 6"

readRenviron("/workspace/.Renviron")

options(blockr.chat_function = function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(model = "gpt-5.1", system_prompt = system_prompt, echo = "none")
})
options(blockr.assistant_immediate_commit = TRUE)
options(shiny.port = 3838L, shiny.host = "0.0.0.0")

suppressPackageStartupMessages({
  pkgload::load_all("/workspace/blockr.ui",        quiet = TRUE)
  pkgload::load_all("/workspace/blockr.core",      quiet = TRUE)
  pkgload::load_all("/workspace/blockr.dock",      quiet = TRUE)
  pkgload::load_all("/workspace/blockr.dplyr",     quiet = TRUE)
  pkgload::load_all("/workspace/blockr.ggplot",    quiet = TRUE)
  pkgload::load_all("/workspace/blockr.viz",       quiet = TRUE)
  pkgload::load_all("/workspace/blockr.dm",        quiet = TRUE)  # dm blocks (example/pull/flatten/join/filter)
  pkgload::load_all("/workspace/blockr.ai",        quiet = TRUE)
  pkgload::load_all("/workspace/blockr.assistant", quiet = TRUE)
})

board <- blockr.dock::new_dock_board(
  blocks = c(
    data = blockr.core::new_dataset_block("iris")
  ),
  extensions = list(assistant = blockr.assistant::new_assistant_extension()),
  layout = list(
    list("data"),
    "assistant"
  )
)

blockr.core::serve(board)
