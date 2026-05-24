library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

board <- new_dock_board(
  blocks = list(),
  extensions = list(assistant = new_assistant_extension()),
  layout = list("assistant")
)

serve(board)
