# Command-style assistant demo.
#
# A minimal board (just the iris dataset) + the assistant, configured for
# "do this, do that" prompts: each mutation commits immediately so the
# model can see the live result and self-correct within the turn.
#
# Requires: OPENAI_API_KEY in the environment, and the assistant's
# immediate-commit feature (blockr.assistant >= the command-style branch).
#
# Run:  shiny::runApp("inst/examples/command-demo", port = 3838, host = "0.0.0.0")
#
# Try, one line at a time:
#   - "add a scatter plot of Sepal.Length vs Petal.Length coloured by Species"
#   - "summarise the mean of every measurement by Species"
#   - "filter the data to rows where Sepal.Length is greater than 6"

library(blockr.core)
library(blockr.dock)
library(blockr.dplyr)   # filter / summarize / arrange ... (registry)
library(blockr.ggplot)  # scatter / bar / line ... (registry)
library(blockr.viz)     # chart / table / summary_table (registry)
library(blockr.dm)      # dm example / pull / flatten / join / filter (registry)
library(blockr.assistant)

# Prod LLM. ellmer's default is gpt-4.1; blockr prod is gpt-5.1.
options(blockr.chat_function = function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(model = "gpt-5.1", system_prompt = system_prompt, echo = "none")
})

# Command-style: flush each mutation immediately so the model verifies +
# self-corrects in-turn (vs. staging the whole turn and flushing at the end).
options(blockr.assistant_immediate_commit = TRUE)

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris")
  ),
  extensions = list(assistant = new_assistant_extension()),
  layout = list(
    list("data"),
    "assistant"
  )
)

serve(board)
