register_read_tools <- function(client, board, update, session) {

  client$register_tool(tool_list_blocks(board, update, session))
  client$register_tool(tool_describe_block(board, update, session))
  client$register_tool(tool_list_links(board, update, session))
  client$register_tool(tool_list_stacks(board, update, session))
  client$register_tool(
    tool_list_available_blocks(board, update, session)
  )
  client$register_tool(
    tool_get_block_result(board, update, session)
  )
  client$register_tool(tool_query_data(board, update, session))

  invisible(client)
}

with_tool_errors <- function(name, expr) {

  tryCatch(
    expr,
    error = function(e) {

      msg <- conditionMessage(e)
      pat <- sprintf("^%s\\([^)]*\\) failed:", name)

      if (grepl(pat, msg)) {
        msg
      } else {
        sprintf("%s failed: %s", name, msg)
      }
    }
  )
}

tool_list_blocks <- function(board, update, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_blocks", {

        b <- isolate(board$board)
        blks <- board_blocks(b)

        if (!length(blks)) {
          return(
            data.frame(
              id      = character(),
              type    = character(),
              name    = character(),
              package = character()
            )
          )
        }

        meta <- block_metadata(blks)

        data.frame(
          id      = names(blks),
          type    = chr_ply(blks, function(x) class(x)[[1L]]),
          name    = meta$name,
          package = meta$package,
          row.names = NULL
        )
      })
    },
    name        = "list_blocks",
    description = paste(
      "List all blocks on the board. One row per block: id, type",
      "(class name), display name, and source package."
    ),
    arguments   = list()
  )
}

tool_describe_block <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_block", {

        brd <- isolate(board$board)
        blks <- board_blocks(brd)

        if (!id %in% names(blks)) {
          return(
            sprintf(
              "No block with id %s. Call list_blocks first.", id
            )
          )
        }

        paste(
          describe_block(blks[[id]], board = brd, id = id),
          collapse = "\n"
        )
      })
    },
    name        = "describe_block",
    description = paste(
      "Describe a block currently on the board: its class chain,",
      "name, arguments and current values, external-control",
      "declaration, and incoming links."
    ),
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}

tool_list_links <- function(board, update, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_links", {
        as.data.frame(board_links(isolate(board$board)))
      })
    },
    name        = "list_links",
    description = paste(
      "List all links between blocks: id, source block (from),",
      "destination block (to), and the input on the destination",
      "that is fed."
    ),
    arguments   = list()
  )
}

tool_list_stacks <- function(board, update, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_stacks", {

        stks <- board_stacks(isolate(board$board))

        if (!length(stks)) {
          return(
            data.frame(
              id          = character(),
              name        = character(),
              blocks      = character(),
              description = character()
            )
          )
        }

        data.frame(
          id          = names(stks),
          name        = chr_ply(stks, function(s) {
            coal(stack_name(s), NA_character_)
          }),
          blocks      = chr_ply(stks, function(s) {
            paste(stack_blocks(s), collapse = ", ")
          }),
          description = chr_ply(stks, function(s) {
            paste(describe_stack(s), collapse = "\n")
          }),
          row.names   = NULL
        )
      })
    },
    name        = "list_stacks",
    description = paste(
      "List all stacks on the board. One row per stack: id, name,",
      "comma-separated member block ids, and a class-specific",
      "description (data.frames are summarised; non-base stack",
      "classes can surface extra attributes via the describe_stack",
      "S3 generic)."
    ),
    arguments   = list()
  )
}

tool_list_available_blocks <- function(board, update, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_available_blocks", {

        uids <- list_blocks()

        if (!length(uids)) {
          return(list())
        }

        meta <- registry_metadata(uids, "all")

        # Build a list-of-records so jsonlite preserves arg NAMES.
        # A data frame with I() list-column loses the names of the
        # arguments vectors during serialization, leaving the model
        # with descriptions but no way to know what each describes.
        lapply(seq_along(uids), function(i) {
          args_vec  <- meta$arguments[[i]]
          arg_names <- names(args_vec)
          examples  <- attr(args_vec, "examples")

          # Convert named char vector -> list keyed by arg name. Wrap
          # each value so jsonlite emits {name: {description, example}}
          # rather than {name: "..."}.
          args_list <- if (length(arg_names)) {
            stats::setNames(
              lapply(arg_names, function(nm) {
                ex <- if (!is.null(examples) && nm %in% names(examples)) {
                  examples[[nm]]
                } else NULL
                list(description = unname(args_vec[[nm]]), example = ex)
              }),
              arg_names
            )
          } else {
            list()
          }

          list(
            id          = uids[[i]],
            name        = meta$name[[i]],
            package     = meta$package[[i]],
            category    = meta$category[[i]],
            description = meta$description[[i]],
            arguments   = args_list
          )
        })
      })
    },
    name        = "list_available_blocks",
    description = paste(
      "List every registered block constructor -- block types the",
      "user can add to the board. Each entry has id, name, package,",
      "category, description, and `arguments`: a named object where",
      "each key is the EXACT constructor argument name and each",
      "value is `{description, example}`. When passing `args` to",
      "add_block, the top-level keys MUST match these argument",
      "names verbatim. If a description says the value is an",
      "object/dict of fields, those nested fields go INSIDE that",
      "argument, not at the top level. `block_name` is always",
      "accepted and is not listed here."
    ),
    arguments   = list()
  )
}

tool_get_block_result <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("get_block_result", {

        blks <- isolate(board$blocks)

        if (!id %in% names(blks)) {
          return(
            sprintf(
              "No block with id %s. Call list_blocks first.", id
            )
          )
        }

        res <- tryCatch(
          isolate(blks[[id]]$server$result()),
          error = function(e) e
        )

        if (inherits(res, "error")) {
          return(
            sprintf(
              "Block %s has not evaluated successfully: %s",
              id, conditionMessage(res)
            )
          )
        }

        paste(summarise_result(res), collapse = "\n")
      })
    },
    name        = "get_block_result",
    description = paste(
      "Return a short text summary of a block's current evaluated",
      "output. Data frames are summarised with skimr-style stats;",
      "other objects fall back to a truncated print. Returns an",
      "error string if the block has not evaluated successfully."
    ),
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}
