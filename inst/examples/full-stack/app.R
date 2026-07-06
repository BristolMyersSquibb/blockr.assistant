# blockr.assistant full-stack demo — the whole board-facing blockr stack in one
# deployable app. A small two-branch board (general analytics on mtcars + a
# single-patient clinical profile) that exercises one block or plugin from every
# major package, with the LLM assistant mounted alongside. Deploy this directory
# as-is (ShinyProxy / rsconnect: it's a self-contained `app.R`), or run locally:
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
# Try in the Assistant pane: "What is on the board?", "Add a scatter plot of
# mpg vs wt", or expand "AI Assist" on the summary table and type "median and
# IQR of mpg and hp grouped by cyl".
#
# Needs an LLM key for the AI features (e.g. OPENAI_API_KEY / ANTHROPIC_API_KEY);
# the board itself renders without one.

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

# Clinical source data for the patient-profile branch (public CDISC ADaM).
library(pharmaverseadam)   # adsl, adae, advs
library(dm)                # dm() container

# ---- Single-patient dm for the patient-profile block -----------------------
# The patient-profile block consumes a `dm` already filtered to ONE subject.
# In a full board that filter comes from an upstream drilldown selector; here
# we build it in plain R and hand it in via a static block, keeping the demo
# self-contained.
one <- adsl$USUBJID[1]
pp_dm <- dm(
  adsl = adsl[adsl$USUBJID == one, ],
  adae = adae[adae$USUBJID == one, ],
  advs = advs[advs$USUBJID == one, ]
)

# ---- Board -----------------------------------------------------------------
board <- new_dock_board(
  blocks = c(
    # === Branch A: general analytics (mtcars) ===
    cars = new_dataset_block("mtcars"),

    # blockr.extra — arbitrary R transform (add a km/l column)
    prep = new_function_block(
      fn = "function(data) { data$kmpl <- data$mpg * 0.4251; data }"
    ),

    # blockr.viz — count of cars per cylinder (AI Assist: change grouping)
    chart = new_chart_block(
      chart_type = "bar",
      group = "cyl",
      value = ".count",
      func = "count"
    ),

    # blockr.viz — grouped summary table (AI Assist: pick vars / stats)
    summary = new_summary_table_block(
      vars = c("mpg", "hp", "wt"),
      by = "cyl"
    ),

    # === Branch B: single-patient clinical profile ===
    patient = new_static_block(pp_dm),
    profile = new_patient_profile_block(
      selected = c("patient_overview", "ae_gantt")
    )
  ),
  links = c(
    # Branch A
    new_link("cars", "prep", "data"),
    new_link("prep", "chart", "data"),
    new_link("prep", "summary", "data"),

    # Branch B
    new_link("patient", "profile", "data")
  ),
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
