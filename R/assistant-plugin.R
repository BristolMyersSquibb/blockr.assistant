#' The assistant's plugin
#'
#' The assistant is a plugin whose agent loop runs in the browser.
#' The constructor `new_assistant_plugin()` makes the plugin, of class
#' `c("assistant_plugin", "plugin")`, whose plugin class has the id
#' `blockr.assistant-assistant_plugin` (see [blockr.core::new_plugin()]).
#' The plugin keeps no state, so the constructor takes no args, and a board
#' holds nothing for the assistant.
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
#' @return A `plugin` object, as [blockr.core::new_plugin()] returns it.
#'
#' @examples
#' new_assistant_plugin()
#'
#' blockr.core::plugin_class_id(new_assistant_plugin())
#'
#' @export
new_assistant_plugin <- function() {
  new_plugin(list(), "assistant_plugin")
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
