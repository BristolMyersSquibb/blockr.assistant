register_board_options_tools <- function(client, board, session) {

  client$register_tool(tool_list_board_options(board, session))
  client$register_tool(tool_set_board_option(board, session))

  invisible(client)
}

model_option_value <- function(value) {

  if (is.function(value)) {
    return(coal(attr(value, "chat_name"), "<function>", fail_all = FALSE))
  }

  value
}

board_option_entry <- function(opt, session) {

  id <- board_option_id(opt)

  list(
    id = id,
    category = board_option_category(opt),
    value = model_option_value(
      coal(
        get_board_option_or_null(id, session),
        board_option_value(opt),
        fail_all = FALSE
      )
    ),
    default = model_option_value(board_option_value(opt))
  )
}

parse_option_value <- function(value) {

  if (!nzchar(value)) {
    stop("no value supplied", call. = FALSE)
  }

  tryCatch(
    typedjson::json_read_str(value),
    error = function(e) value
  )
}

tool_list_board_options <- function(board, session) {

  ellmer::tool(
    function() {
      with_tool_errors({

        opts <- board_options(isolate(board$board))

        typedjson::json_write_str(
          unname(isolate(lapply(opts, board_option_entry, session)))
        )
      })
    },
    name        = "list_board_options",
    description = paste(
      "List the board's options -- user-level board settings such as",
      "board name, theming, dark mode and table page size. One entry",
      "per option: id, category, current value and default, as JSON.",
      "A \"~\" marks what plain JSON cannot hold (\"~zInf\" is",
      "infinity, \"~~\" a literal \"~\"); pass such a value back to",
      "set_board_option unchanged. Values are board-dependent; current",
      "values reflect live session state. Use set_board_option to",
      "change a value."
    ),
    arguments   = list()
  )
}

tool_set_board_option <- function(board, session) {

  ellmer::tool(
    function(id, value) {
      with_tool_errors({

        opts <- board_options(isolate(board$board))

        if (!id %in% names(opts)) {
          stop(
            glue::glue(
              "No board option with id {id}. Call list_board_options first."
            ),
            call. = FALSE
          )
        }

        if (identical(id, "llm_model")) {
          stop(
            paste(
              "The llm_model option drives the assistant's own chat",
              "client and cannot be set here."
            ),
            call. = FALSE
          )
        }

        coerced <- board_option_value(opts[[id]], parse_option_value(value))

        set_board_option_value(id, coerced, isolate(board$board), session)

        glue::glue(
          "Set board option {id} to ",
          "{typedjson::json_write_str(model_option_value(coerced))}."
        )
      })
    },
    name        = "set_board_option",
    description = paste(
      "Set the value of an existing board option (see",
      "list_board_options for ids and current values). `value` is",
      "JSON-encoded: a string in quotes (\"My board\"), booleans as",
      "true/false, integers as 5, arrays as [\"warning\",\"error\"],",
      "null as null; a bare unquoted word is treated as a string.",
      "The value is coerced to the option's type. The llm_model",
      "option cannot be set here."
    ),
    arguments = list(
      id = ellmer::type_string(
        "Board option id, as returned by list_board_options."
      ),
      value = ellmer::type_string(
        paste(
          "New value, JSON-encoded (e.g. \"My board\", true, 5,",
          "[\"warning\",\"error\"], null)."
        )
      )
    )
  )
}
