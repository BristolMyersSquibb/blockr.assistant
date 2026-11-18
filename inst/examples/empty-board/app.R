library(blockr.core)
library(blockr.assistant)

# A board with no blocks, on which the assistant builds what the user asks
# for.
# The app runs under the frontend that its packages give: the dock where
# blockr.dock is installed, and core's basic frontend otherwise.
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

board <- new_board(plugins = list(assistant = new_assistant_plugin()))

serve(board)
