library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

board <- new_dock_board(
  blocks = list(iris = new_dataset_block("iris")),
  extensions = list(new_assistant_extension())
)

shinyApp(board_ui("app", board), board_server("app", board))
