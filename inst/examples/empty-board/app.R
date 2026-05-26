pkgload::load_all("blockr.core")
pkgload::load_all("blockr.ui")
pkgload::load_all("blockr.dplyr")
pkgload::load_all("blockr.bi")
pkgload::load_all("blockr.dm")
pkgload::load_all("blockr.dag")
pkgload::load_all("blockr.dock")
pkgload::load_all("blockr.pharma")
pkgload::load_all("blockr.ai")
pkgload::load_all("blockr.session")
pkgload::load_all("blockr.assistant")

options(blockr.chat_function = function(system_prompt = NULL,
                                        params = NULL) {
  ellmer::chat_openai(
    model         = "gpt-5.2",
    system_prompt = system_prompt,
    params        = params,
    echo          = "none"
  )
})

board <- new_dock_board(
  blocks = list(),
  extensions = list(
    dag_extension = blockr.dag::new_dag_extension(),
    assistant     = new_assistant_extension()
  ),
  layout = list(
    list("dag_extension"),
    "assistant"
  )
)

serve(
  board,
  plugins = blockr.core::custom_plugins(c(
    blockr.ai::ai_ctrl_block(),       # AI chat replaces per-block config UI
    blockr.session::manage_project()  # navbar save/load for the whole board
  ))
)
