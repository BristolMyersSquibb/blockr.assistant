# The deployment's own tools, from a server-side option and never from board
# state, so only the operator can widen the tool surface. A name that is already
# taken fails the client build: registering under it would replace the earlier
# tool, leaving either one of the assistant's own or the deployment's silently
# unreachable.
register_custom_tools <- function(client) {

  tools <- custom_tools()
  nms   <- chr_ply(tools, function(x) x@name)

  dupes <- unique(nms[duplicated(nms)])

  if (length(dupes)) {
    blockr_abort(
      "Tool name{?s} {dupes} {?is/are} used more than once in the ",
      "assistant_tools option.",
      class = "invalid_tools_option"
    )
  }

  taken <- intersect(nms, reserved_tool_names(client))

  if (length(taken)) {
    blockr_abort(
      "Tool name{?s} {taken} in the assistant_tools option {?is/are} ",
      "taken by the assistant's own tools.",
      class = "invalid_tools_option"
    )
  }

  client$register_tools(tools)

  invisible(client)
}

custom_tools <- function() {

  tools <- blockr_option("assistant_tools", list())

  if (!is.list(tools) || !all(lgl_ply(tools, inherits, "ellmer::ToolDef"))) {
    blockr_abort(
      "The assistant_tools option must be a list of tools made with ",
      "`ellmer::tool()`.",
      class = "invalid_tools_option"
    )
  }

  tools
}

# The typed tools are only registered once the model describes a type, but their
# names are reserved all the same: the pool would replace a deployment tool of
# the same name when it arms one, and remove it outright when it evicts one.
reserved_tool_names <- function(client) {

  types <- list_blocks()

  c(
    names(client$get_tools()),
    block_tool_name("add", types),
    block_tool_name("modify", types)
  )
}
