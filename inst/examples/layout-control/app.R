library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

# A board of two views, for arranging the panels through the assistant, which
# runs the dock's commands.
# The view Workbench shows the panels of three blocks in a column, beside the
# assistant's panel, which its grid places with plg("assistant").
# The view Chart shows the panel of the plot alone.
# Try:
#
# - "Show the plot in the view Workbench too."
# - "Add a view Summary that shows the head block."
#
# The assistant calls its model from the browser.
# A deployment says where the calls go through the assistant's blockr options.
# It sets them as environment variables, so that this script stays as it is.
# A demo on OpenAI's models sets two of them:
#
#   BLOCKR_ASSISTANT_API_KEY, the deployment's key
#   BLOCKR_ASSISTANT_MODELS, the models that it offers, such as gpt-5.4
#
# Where the deployment sets no key, the chat asks each visitor for their own.
# A deployment that sends its calls to another base URL names it in
# BLOCKR_ASSISTANT_BASE_URL.
# It names the API that the base URL speaks in BLOCKR_ASSISTANT_API, unless
# that is OpenAI's Responses API.
# An app whose visitors log in with OpenRouter sets these two:
#
#   BLOCKR_ASSISTANT_BASE_URL, OpenRouter's https://openrouter.ai/api/v1
#   BLOCKR_ASSISTANT_API, openai-completions

board <- new_board(
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
  plugins = list(
    new_dock_plugin(
      views = list(
        Workbench = dock_view(
          dock_grid(
            group(blk("data"), blk("filt"), blk("head")),
            plg("assistant"),
            sizes = c(0.6, 0.4)
          )
        ),
        Chart = dock_view("plot")
      )
    ),
    assistant = new_assistant_plugin()
  )
)

serve(board)
