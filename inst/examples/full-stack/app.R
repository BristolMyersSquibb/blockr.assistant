# blockr.assistant full-stack demo — the whole board-facing blockr stack in one
# deployable app, started from an EMPTY board. Nothing is on the canvas: just the
# LLM assistant chat pane and an empty Workflow (DAG) panel. You build the entire
# board from scratch by talking to the assistant, which can add any block from the
# loaded packages below. Deploy this directory as-is (ShinyProxy / rsconnect: it's
# a self-contained `app.R`), or run locally:
#
#   shiny::runApp(
#     system.file("examples/full-stack", package = "blockr.assistant"),
#     port = 3838
#   )
#
# What each package contributes:
#   blockr.core       new_dataset_block(), new_static_block()  — data sources
#   blockr.viz        new_chart_block(), new_summary_table_block()  — display
#   blockr.extra      new_function_block()  — arbitrary R transform
#   blockr.pharma     new_patient_profile_block()  — clinical per-patient view
#   blockr.dock       new_dock_board()  — the docking layout host
#   blockr.dag        new_dag_extension()  — the Workflow (DAG) panel
#   blockr.ai         ai_ctrl_block()  — per-block "AI Assist" chat control
#   blockr.code       generate_flat_code()  — idiomatic code-export plugin
#   blockr.assistant  new_assistant_extension()  — board-level LLM chat pane
#
# Try in the Assistant pane: "Add the mtcars dataset", "Now add a scatter plot of
# mpg vs wt", or "Summarise median and IQR of mpg and hp grouped by cyl".
#
# Needs an LLM key for the AI features (e.g. OPENAI_API_KEY / ANTHROPIC_API_KEY).

# ---- Package loading (dual: installed vs local source) ---------------------
# `dev_local = FALSE` (the default, and what ships) attaches the INSTALLED
# packages with library(). Set it to TRUE to load every blockr package from its
# LOCAL source checkout with pkgload::load_all(). One board, two loaders.
if (!exists("dev_local")) dev_local <- FALSE

blockr_pkgs <- c(
  "blockr.core",       # board + data/static blocks, serve(), plugins
  "blockr.dock",       # new_dock_board() docking layout host
  "blockr.dag",        # Workflow (DAG) extension
  "blockr.viz",        # chart + summary-table display blocks
  "blockr.extra",      # function block (arbitrary R)
  "blockr.pharma",     # patient-profile clinical block
  "blockr.code",       # idiomatic code-export plugin
  "blockr.ai",         # per-block AI control plugin
  "blockr.assistant"   # board-level LLM assistant extension
)

for (pkg in blockr_pkgs) {
  if (dev_local) pkgload::load_all(pkg, quiet = TRUE)
  else library(pkg, character.only = TRUE)
}

# ---- LLM model choices (sidebar selector) ----------------------------------
# blockr.core builds the board's "LLM Model" option from the `blockr.chat_function`
# option. A single function means no dropdown; a NAMED LIST of functions renders
# a selector in the board-options sidebar, one entry per name, and the assistant
# rebuilds its chat client whenever you switch. Each constructor MUST have the
# exact signature `function(system_prompt = NULL, params = NULL)` (blockr.core
# validates this) and return an ellmer chat client. Here we offer both the full
# the cheaper gpt-5.4-nano and the full gpt-5.4; the first entry is the default.
options(blockr.html_table_preview = TRUE)

# Only register our own model selector when nothing upstream has already set one.
# On blockr.cloud an R_PROFILE_USER gateway pre-sets `blockr.chat_function` to
# route through the capped LiteLLM proxy (served models: gpt-4o-mini, gpt-5-nano);
# overriding it here would send chat straight to api.openai.com with the gateway's
# virtual key and 401. Locally the option is unset, so we offer the gpt-5.4 family
# (needs your own OPENAI_API_KEY / models your account can access).
if (is.null(getOption("blockr.chat_function"))) {
  options(
    blockr.chat_function = list(
      "gpt-5.4-nano" = function(system_prompt = NULL, params = NULL) {
        ellmer::chat_openai(
          model = "gpt-5.4-nano",
          system_prompt = system_prompt,
          params = params
        )
      },
      "gpt-5.4" = function(system_prompt = NULL, params = NULL) {
        ellmer::chat_openai(
          model = "gpt-5.4",
          system_prompt = system_prompt,
          params = params
        )
      }
    )
  )
}

# ---- Board -----------------------------------------------------------------
# An empty board: no blocks, no links. Only the two extensions are mounted, so
# the app opens on a blank canvas with the assistant chat pane and an empty
# Workflow (DAG) panel. Everything else is added interactively via the assistant.
board <- new_dock_board(
  blocks = list(),
  links = list(),
  extensions = list(
    assistant = new_assistant_extension(),  # blockr.assistant chat pane
    dag       = new_dag_extension()          # blockr.dag Workflow panel
  )
)

# ai_ctrl_block() (blockr.ai) adds the per-block "AI Assist" control;
# generate_flat_code() (blockr.code) swaps in the idiomatic code exporter.
serve(
  board,
  plugins = custom_plugins(c(ai_ctrl_block(), generate_flat_code()))
)
