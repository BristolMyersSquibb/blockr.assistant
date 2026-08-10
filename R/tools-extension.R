register_extension_tools <- function(client, board, pending, extensions,
                                     session) {

  client$register_tool(tool_list_extensions(board, extensions, session))
  client$register_tool(tool_describe_extension(board, extensions, session))
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

          desc <- extension_description(exts[[id]])

          if (!is.null(desc)) {
            desc <- truncate_chars(
              desc, description_max_chars(),
              "call describe_extension for the full description"
            )
          }

          compact(
            list(
              id           = id,
              name         = extension_name(exts[[id]]),
              description  = desc,
              controllable = external_ctrl_vars(exts[[id]])
            )
          )
        })
      })
    },
    name = "list_extensions",
    description = paste(
      "List dock extensions on the board. One lean entry per extension:",
      "its id, display name, an optional `description` explaining what",
      "the extension is and how to drive it (present only when the",
      "extension supplies one), and the variables that are externally",
      "controllable via modify_extension. An empty `controllable` list",
      "means the extension exposes no modifiable variables. Call",
      "describe_extension(id) for an extension's current variable",
      "values. Dock boards only."
    ),
    arguments = list()
  )
}

tool_describe_extension <- function(board, extensions, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_extension", {

        brd <- isolate(board$board)

        if (!inherits(brd, "dock_board")) {
          return("This board is not a dock board -- it has no extensions.")
        }

        exts <- as.list(dock_extensions(brd))

        if (!id %in% names(exts)) {
          return(
            sprintf(
              "No extension with id %s. Call list_extensions first.", id
            )
          )
        }

        ext  <- exts[[id]]
        vars <- external_ctrl_vars(ext)

        values <- set_names(
          lapply(vars, ext_current_value, extensions, id),
          vars
        )

        compact(
          list(
            id           = id,
            name         = extension_name(ext),
            description  = extension_description(ext),
            skills       = skill_refs(extension_skills(class(ext)[[1L]])),
            controllable = vars,
            values       = compact(values)
          )
        )
      })
    },
    name = "describe_extension",
    description = paste(
      "Report a dock extension's current detail: its full description,",
      "any deployment-authored `skills` scoped to its class, and the",
      "current values of its externally controllable variables",
      "(e.g. a document extension's text). The per-extension drill-down",
      "companion to list_extensions, which carries only id, name and the",
      "variable names. A scoped skill is this deployment's convention",
      "for driving the extension; load one with read_skill. Dock boards",
      "only."
    ),
    arguments = list(
      id = ellmer::type_string(
        "Extension id, as returned by list_extensions."
      )
    )
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
          "Staged modify_extension(%s) -- call commit to apply.", id
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
