library(blockr.core)
library(blockr.assistant)

# A small pipeline on the board before the assistant opens, so that it has
# something to read and to build on.
# The app runs under the frontend that its packages give: the dock where
# blockr.dock is installed, and core's basic frontend otherwise.
# Try:
#
# - "What is on the board?"
#   The answer comes from the board that each call sends the model, with no
#   tool call.
# - "What are the unique values of Species in the data block?"
#   The model calls inspect_results, with code such as unique(data$Species).
# - "Add a scatter plot of Sepal.Length against Petal.Length."
#   The model adds the block and links it in one edit, and reads the edit's
#   review.
# - "Change the id of the block head to top_rows."
#   Ids never change, so the model explains that it would remove the block
#   and add it again, and asks before it does.
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
  stacks = c(
    prep = new_stack(c("data", "filt"), name = "Prep"),
    display = new_stack(c("head", "plot"), name = "Display")
  ),
  plugins = list(assistant = new_assistant_plugin())
)

serve(board)
