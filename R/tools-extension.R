register_extension_tools <- function(client, board, pending, extensions,
                                     session) {

  client$register_tool(tool_list_extensions(board, extensions, session))
  client$register_tool(tool_modify_extension(board, pending, session))

  invisible(client)
}

ext_current_value <- function(var, extensions, id) {

  if (is.null(extensions) || !id %in% ls(extensions)) {
    return(NULL)
  }

  rv <- extensions[[id]]$state[[var]]

  if (!is.function(rv)) {
    return(NULL)
  }

  tryCatch(isolate(rv()), error = function(e) NULL)
}

tool_list_extensions <- function(board, extensions, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_extensions", {

        brd <- isolate(board$board)

        if (!inherits(brd, "dock_board")) {
          return(list())
        }

        exts <- as.list(dock_extensions(brd))

        if (!length(exts)) {
          return(list())
        }

        lapply(names(exts), function(id) {

          vars <- external_ctrl_vars(exts[[id]])

          values <- set_names(
            lapply(vars, ext_current_value, extensions, id),
            vars
          )

          list(
            id           = id,
            name         = extension_name(exts[[id]]),
            controllable = vars,
            values       = compact(values)
          )
        })
      })
    },
    name = "list_extensions",
    description = paste(
      "List dock extensions on the board. One entry per extension:",
      "its id, display name, the variables that are externally",
      "controllable via modify_extension, and their current values.",
      "An empty `controllable` list means the extension exposes no",
      "modifiable variables. Dock boards only."
    ),
    arguments = list()
  )
}

tool_modify_extension <- function(board, pending, session) {

  ellmer::tool(
    function(id, args) {
      with_tool_errors("modify_extension", {

        delta <- parse_args_json(args, "modify_extension")

        if (!length(delta)) {
          stop(
            "no fields supplied; pass at least one key in `args`",
            call. = FALSE
          )
        }

        stage_extension_mod(pending, board, id, delta)

        sprintf(
          "Staged modify_extension(%s) -- will apply at turn end.", id
        )
      })
    },
    name = "modify_extension",
    description = paste(
      "Change one or more externally controllable variables of a",
      "dock extension -- for example, rewrite a document",
      "extension's text. `args` is a JSON object (passed as a",
      "string) of just the keys being changed; unmentioned keys",
      "keep their current values. The controllable keys for each",
      "extension are reported by list_extensions; non-controllable",
      "keys and unknown extension ids are rejected at stage time."
    ),
    arguments = list(
      id = ellmer::type_string(
        "Extension id, as returned by list_extensions."
      ),
      args = ellmer::type_string(
        paste(
          "JSON object of variables to change, e.g.",
          "'{\"content\": \"# Title\"}'. Only supplied keys are modified."
        )
      )
    )
  )
}
