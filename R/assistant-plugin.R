#' The assistant's plugin
#'
#' The assistant is a plugin whose agent loop runs in the browser.
#' The constructor `new_assistant_plugin()` makes the plugin, of class
#' `c("assistant_plugin", "plugin")`, whose plugin class has the id
#' `blockr.assistant-assistant_plugin` (see [blockr.core::new_plugin()]).
#'
#' The plugin keeps the assistant's conversations in the board, which saves
#' them with the rest of the board.
#' Each conversation, under its id, has a `title`, the time it was `updated`,
#' its `messages`, the tokens that its calls to the model spent, in `usage`,
#' and its pick of the `model`, or `NULL` for the default.
#' The JSON Schema of that state ships beside the class's module, as
#' `js/assistant_plugin.schema.json`, and R writes the state by it.
#' Only the assistant's own commands change the state, and none of them takes
#' an undo step, so that no undo takes back a message.
#'
#' The blockr option `chat_save_turns` caps how many messages of each
#' conversation the board keeps: 50 by default, `0` for none and `-1` for
#' every one.
#' A deployment sets it as the R option `blockr.chat_save_turns` or the
#' environment variable `BLOCKR_CHAT_SAVE_TURNS`.
#' The board keeps whole exchanges, each from a message that the user sent,
#' and the plugin keeps the older messages in the browser's memory while the
#' board stays open.
#' As a board opens, the plugin cuts each of its conversations to the cap.
#' Under `0`, it keeps every conversation in the browser's memory alone.
#'
#' The package lists the class in the `._BLOCKR_MODULES_` that it exports,
#' with its name, "Assistant", and its module, `js/assistant_plugin.js` (see
#' [blockr.core::read_blocks_yml()]).
#' So [blockr.core::available_plugins()] gives the class wherever
#' blockr.assistant is available, and [blockr.core::serve()] runs the
#' assistant in every app that does not narrow its plugins.
#' The class's `ui` draws the assistant's panel, an empty one, wherever the
#' frontend places the plugin.
#'
#' @param conversations The conversations of a board that an app script
#'   builds, by id, each a list in the shape that the schema gives.
#'
#' @return A `plugin` object, as [blockr.core::new_plugin()] returns it.
#'
#' @examples
#' new_assistant_plugin()
#'
#' blockr.core::plugin_class_id(new_assistant_plugin())
#'
#' plugin <- new_assistant_plugin(
#'   conversations = list(
#'     c1 = list(
#'       title = "Sales by region",
#'       updated = "2026-11-16T08:00:00Z",
#'       messages = list(
#'         list(
#'           id = "m1",
#'           role = "user",
#'           parts = list(
#'             list(type = "text", text = "Sum the sales by region.")
#'           ),
#'           created = "2026-11-16T08:00:00Z"
#'         )
#'       ),
#'       usage = list(input = 0, output = 0, last = 0),
#'       model = NULL
#'     )
#'   )
#' )
#'
#' names(blockr.core::plugin_state(plugin)[["conversations"]])
#'
#' @export
new_assistant_plugin <- function(conversations = list()) {

  if (!is_conversations(conversations)) {
    blockr_abort(
      "Expecting `conversations` to be a list of conversations, each named ",
      "by its id.",
      class = "invalid_conversations"
    )
  }

  new_plugin(list(conversations = conversations), "assistant_plugin")
}

# Whether `x` is a list of conversations by id: empty, or with a name for each
# conversation that no other conversation has.
is_conversations <- function(x) {

  if (!is.list(x) || is.object(x)) {
    return(FALSE)
  }

  ids <- names(x)

  !length(x) ||
    (!is.null(ids) && !anyNA(ids) && all(nzchar(ids)) && !anyDuplicated(ids))
}

#' @rdname new_assistant_plugin
#' @format NULL
#' @usage NULL
#' @export
._BLOCKR_MODULES_ <- list( # nolint: object_name_linter.
  plugins = list(
    new_assistant_plugin = list(
      id = "assistant_plugin",
      name = "Assistant",
      module = "js/assistant_plugin.js"
    )
  )
)
