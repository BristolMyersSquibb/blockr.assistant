# A multi-view board for exercising the layout-control tools. Two views
# share one block pipeline: "Workbench" holds the data prep plus the
# assistant, "Chart" holds the scatter plot. The assistant lives in the
# Workbench view, so drive the demo from there. Try:
#
# - "What views are on the board, and what's in each?" -- one list_views
#   call; the answer describes both layouts in spec form.
# - "Rearrange this view: stack data, filt and head vertically on the
#   left, and put yourself on the right." -- a modify_view on the active
#   view; you watch Workbench re-lay-out in place.
# - "Give the Chart view a second tab next to the plot showing the head
#   block." -- modify_view on a view you're not looking at; flip to the
#   Chart tab to see it.
# - "Add a view called Summary with just the head block, and switch to
#   it." -- add_view + set_active_view, composed in one turn.
# - "Rename the Chart view to Figure." -- rename_view (add + rm + active
#   carry-over under the hood).

library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

# The assistant's model picker is populated from the `blockr.chat_function`
# option (a named list of ellmer chat constructors); its default is OpenAI.
# Point it at Anthropic so the "LLM Model" dropdown lists Claude models and
# defaults to the first. Requires ANTHROPIC_API_KEY in the environment.
options(
  blockr.chat_function = list(
    "Claude Sonnet 4.6" = function(system_prompt = NULL, params = NULL) {
      ellmer::chat_anthropic(
        system_prompt = system_prompt,
        model = "claude-sonnet-4-6"
      )
    },
    "Claude Opus 4.7" = function(system_prompt = NULL, params = NULL) {
      ellmer::chat_anthropic(
        system_prompt = system_prompt,
        model = "claude-opus-4-7"
      )
    },
    "Claude Haiku 4.5" = function(system_prompt = NULL, params = NULL) {
      ellmer::chat_anthropic(
        system_prompt = system_prompt,
        model = "claude-haiku-4-5-20251001"
      )
    }
  )
)

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris"),
    filt = new_subset_block(subset = "Sepal.Length > 5"),
    head = new_head_block(n = 10L),
    plot = new_scatter_block(x = "Sepal.Length", y = "Sepal.Width")
  ),
  links = c(
    new_link("data", "filt", "data"),
    new_link("filt", "head", "data"),
    new_link("filt", "plot", "data")
  ),
  extensions = list(assistant = new_assistant_extension()),
  layouts = list(
    Workbench = dock_layout(
      group("data", "filt", "head"),
      "assistant_extension",
      sizes = c(0.6, 0.4),
      active = TRUE
    ),
    Chart = dock_layout("plot")
  )
)

serve(board)
