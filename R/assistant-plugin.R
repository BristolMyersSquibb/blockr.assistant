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
#' @section Requests:
#' The class answers five requests in R, through its method of
#' [blockr.core::plugin_requests()].
#' R calls each with the plugin's args by name, and with the blocks that it
#' reads in `reads`, where the request takes them.
#' The requests that read skills take the app's packages by name, in
#' `packages`.
#'
#' * The request `describe_result` gives what [describe_result()] writes about
#'   the result of each block that it reads, by block id.
#'   It cuts each text at the blockr option `assistant_summary_max_chars`,
#'   2000 by default.
#' * The request `inspect_results` runs the R code in `code` with a PNG device
#'   open.
#'   The code runs in an environment whose parent is `baseenv()`, which binds
#'   the result of each block that the request reads to the block's id.
#'   The request gives what the code prints in `output`, cut at the blockr
#'   option `assistant_eval_max_chars`, 16000 by default.
#'   It gives the plots that the code draws in `plots`, each a PNG as a base64
#'   string, up to `assistant_plot_render_max`, 4 by default.
#'   They are `width` by `height` pixels, within
#'   `assistant_plot_render_range`, 200 to 2000 by default.
#'   Either is `assistant_plot_render_px`, 768 by default, where it is left
#'   out.
#'   R refuses the request on a locked board, where the blockr option `locked`
#'   is on.
#' * The request `list_skills` gives the skills (below), each with its `name`
#'   and `description`, the block classes that it names in `blocks`, the
#'   plugin classes that it names in `plugins`, and its flags
#'   `user-invocable` and `disable-model-invocation`.
#' * The request `read_skill` gives the text of the skill `name`, or that of
#'   the file at `path` that the skill bundles.
#' * The request `read_template` gives the text of the file that the blockr
#'   option `assistant_template` names, or `NULL` where it names none.
#'
#' @section Skills:
#' A skill is a directory that holds a `SKILL.md`.
#' The file's YAML frontmatter gives the skill's `name`, which is the
#' directory's, and its `description`.
#' It may name block classes by their registry ids in `blocks:`, plugin
#' classes by their ids in `plugins:`, and the packages that the skill needs
#' in `requires:`.
#' It may also set the flags `user-invocable` and `disable-model-invocation`.
#'
#' R lists the skills of each of the app's packages, from the package's
#' `inst/assistant/skills`, in the order of the packages' names.
#' It then lists those of the directory that the blockr option
#' `assistant_skills` names.
#' A skill takes the place of one of the same name that R listed before it.
#' R does not read a package's `inst/skills`, where btw finds the skills that
#' it gives coding agents.
#'
#' @param x The assistant's plugin.
#' @param ... Unused.
#'
#' @return The constructor `new_assistant_plugin()` returns a `plugin` object,
#' as [blockr.core::new_plugin()] returns it.
#' The method of `plugin_requests()` returns the five requests, a list of
#' functions by name.
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
