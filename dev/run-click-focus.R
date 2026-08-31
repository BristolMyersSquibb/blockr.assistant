# Runs the packaged `populated-board` example against the dev sources, to try
# click-to-focus: click a block card and its name lands in the focus picker
# below the chat; remove it there and a re-echo of the same panel does not put
# it back.
#
# The chat client is built from whatever provider is configured. With no API
# key the panel still mounts and the picker still fills -- only sending a
# message fails, which is the honest outcome of having no provider.

# Sibling packages -- and any provider key -- come from the workspace this
# package sits in, so run this from the package root. Set BLOCKR_WORKSPACE if
# your checkout is laid out differently.
workspace <- Sys.getenv(
  "BLOCKR_WORKSPACE",
  unset = normalizePath("..", mustWork = FALSE)
)

renviron <- file.path(workspace, ".Renviron")

if (file.exists(renviron)) {
  readRenviron(renviron)
}

# blockr.dock from source, not the library: the picker is
# `board_block_select()`, which the installed build predates.
for (pkg in c("blockr.dock", "blockr.assistant")) {
  pkgload::load_all(file.path(workspace, pkg), quiet = TRUE)
}

has_key <- function(x) nzchar(Sys.getenv(x))

if (has_key("ANTHROPIC_API_KEY") && !has_key("OPENAI_API_KEY")) {
  options(
    blockr.chat_function = function(system_prompt = NULL, params = NULL) {
      ellmer::chat_anthropic(system_prompt = system_prompt, params = params)
    }
  )
} else if (!has_key("OPENAI_API_KEY")) {
  message("No provider key found -- the chat will mount but cannot send.")
  options(
    blockr.chat_function = function(system_prompt = NULL, params = NULL) {
      ellmer::chat_openai(
        system_prompt = system_prompt, params = params,
        api_key = "no-provider-configured"
      )
    }
  )
}

port <- blockr_port()

message("Serving on http://127.0.0.1:", port, "/")

# The packaged example's board would do, but its default layout parks the
# assistant in a rail that collapses the moment another panel is clicked --
# which is the one thing you want to watch here. So the grid is spelled out:
# the blocks in one tab group, the chat beside them, both on screen at once.
board <- new_dock_board(
  blocks = c(
    data = blockr.core::new_dataset_block("iris"),
    filt = blockr.core::new_subset_block(subset = "Sepal.Length > 5"),
    head = blockr.core::new_head_block(n = 10L),
    plot = blockr.core::new_scatter_block(x = "Sepal.Length", y = "Sepal.Width")
  ),
  links = c(
    blockr.core::new_link("data", "filt", "data"),
    blockr.core::new_link("filt", "head", "data"),
    blockr.core::new_link("filt", "plot", "data")
  ),
  extensions = list(assistant = new_assistant_extension()),
  grids = list(
    main = as_dock_grid(
      list(
        orientation = "horizontal",
        children = list(
          list(panels = c("data", "filt", "head", "plot")),
          list(panels = "assistant")
        ),
        sizes = c(0.68, 0.32)
      )
    )
  )
)

shiny::runApp(
  blockr.core::serve(board), port = port, host = "0.0.0.0",
  launch.browser = FALSE
)
