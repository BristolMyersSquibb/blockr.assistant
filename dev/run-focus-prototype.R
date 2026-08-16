# Runs the packaged `populated-board` example against the dev sources, to try
# the selected-block chip: click a block card and it names that block in the
# chat panel; click the x and it lets go.
#
# The chat client is built from whatever provider is configured. With no API
# key the panel still mounts and the chip still works -- only sending a message
# fails, which is the honest outcome of having no provider.

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

for (pkg in c("blockr.core", "blockr.dock", "blockr.assistant")) {
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

# The example ends on `serve(board)`, which *returns* a shiny app object and
# runs it by auto-printing at the top level. Sourced, nothing prints and
# nothing runs, so take the value and run it here.
app <- source(
  file.path(
    workspace, "blockr.assistant",
    "inst", "examples", "populated-board", "app.R"
  ),
  local = new.env()
)$value

shiny::runApp(app, port = port, host = "0.0.0.0", launch.browser = FALSE)
