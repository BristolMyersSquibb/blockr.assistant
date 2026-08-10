register_read_tools <- function(client, board, update, session) {

  client$register_tool(tool_list_blocks(board, update, session))
  client$register_tool(tool_describe_block(board, update, session))
  client$register_tool(tool_list_links(board, update, session))
  client$register_tool(tool_list_stacks(board, update, session))
  client$register_tool(tool_describe_stack(board, update, session))
  client$register_tool(
    tool_list_block_types(board, update, session)
  )
  client$register_tool(
    tool_describe_block_type(board, update, session)
  )
  client$register_tool(
    tool_get_block_result(board, update, session)
  )
  client$register_tool(
    tool_get_block_conditions(board, update, session)
  )
  client$register_tool(tool_query_data(board, update, session))

  invisible(client)
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

        summary <- truncate_chars(
          paste(
            describe_block(blks[[id]], board = brd, id = id),
            collapse = "\n"
          ),
          summary_max_chars()
        )

        skills <- block_skills(registry_id_from_block(blks[[id]]))

        paste(c(summary, skill_lines(skills)), collapse = "\n")
      })
    },
    name        = "describe_block",
    description = paste(
      "Describe a block currently on the board: its class chain,",
      "name, arguments and current values, external-control",
      "declaration, incoming links, and any deployment-authored",
      "`skills` scoped to its type."
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
              id     = character(),
              name   = character(),
              blocks = character()
            )
          )
        }

        data.frame(
          id     = names(stks),
          name   = chr_ply(
            stks, function(s) coal(stack_name(s), NA_character_)
          ),
          blocks = chr_ply(stks, function(s) {
            paste(stack_blocks(s), collapse = ", ")
          }),
          row.names = NULL
        )
      })
    },
    name        = "list_stacks",
    description = paste(
      "List all stacks on the board. One row per stack: id, name, and",
      "comma-separated member block ids. Call describe_stack for a",
      "stack's class-specific description -- non-base stack classes can",
      "surface extra attributes (e.g. a colour) via the describe_stack",
      "S3 generic."
    ),
    arguments   = list()
  )
}

tool_describe_stack <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_stack", {

        stks <- board_stacks(isolate(board$board))

        if (!id %in% names(stks)) {
          return(
            sprintf("No stack with id %s. Call list_stacks first.", id)
          )
        }

        truncate_chars(
          paste(describe_stack(stks[[id]]), collapse = "\n"),
          summary_max_chars()
        )
      })
    },
    name        = "describe_stack",
    description = paste(
      "Describe a stack on the board: its name, member block ids, and",
      "any class-specific attributes a non-base stack surfaces via the",
      "describe_stack S3 generic. The per-stack drill-down companion to",
      "list_stacks."
    ),
    arguments   = list(
      id = ellmer::type_string("Stack id, as returned by list_stacks.")
    )
  )
}

arg_spec <- function(x) {
  compact(
    list(
      description = block_arg_description(x),
      type = block_arg_type(x)
    )
  )
}

arg_specs <- function(args) {
  set_names(lapply(args, arg_spec), names(args))
}

type_inputs <- function(id) {

  blk <- tryCatch(create_block(id), error = function(e) NULL)

  if (is.null(blk)) {
    return(NA_character_)
  }

  if (is.na(block_arity(blk))) {
    return("...")
  }

  ins <- block_inputs(blk)

  if (length(ins)) paste(ins, collapse = ", ") else NA_character_
}

tool_list_block_types <- function(board, update, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_block_types", {

        uids <- list_blocks()

        if (!length(uids)) {
          return(
            data.frame(
              id          = character(),
              name        = character(),
              package     = character(),
              category    = character(),
              description = character(),
              inputs      = character()
            )
          )
        }

        meta <- block_metadata(uids)

        data.frame(
          id          = uids,
          name        = meta$name,
          package     = meta$package,
          category    = meta$category,
          description = chr_ply(
            meta$description, truncate_chars, description_max_chars(),
            "call describe_block_type for the full description",
            use_names = FALSE
          ),
          inputs      = chr_ply(uids, type_inputs, use_names = FALSE),
          row.names   = NULL
        )
      })
    },
    name        = "list_block_types",
    description = paste(
      "List every registered block constructor -- the block types the",
      "user can add to the board. One lean row per type, carrying just",
      "the fields you pick a type on: id, name, package, category, a",
      "one-line description, and an `inputs` column listing the block's",
      "input-slot names. Call describe_block_type(id) for a chosen",
      "type's construction detail -- its guidance, per-argument",
      "descriptions and types, and worked examples -- before",
      "configuring it. Use the `inputs` names verbatim as the `input=`",
      "value in add_link (most blocks take \"data\"; some take several,",
      "e.g. \"data, by\") -- never invent a slot name. An empty `inputs`",
      "(NA) is a source block that takes no incoming links. An `inputs`",
      "of \"...\" is a variadic block (e.g. rbind, glue) that accepts any",
      "number of links: give each link its own distinct `input` name,",
      "or pass \"\" to auto-number them -- never pass \"...\" itself."
    ),
    arguments   = list()
  )
}

tool_describe_block_type <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_block_type", {

        if (!id %in% list_blocks()) {
          return(
            sprintf(
              paste(
                "No registered block type '%s'.",
                "Call list_block_types first."
              ),
              id
            )
          )
        }

        meta <- block_metadata(id)

        compact(
          list(
            id          = id,
            name        = meta$name,
            package     = meta$package,
            category    = meta$category,
            description = meta$description,
            guidance    = nullify(meta$guidance),
            skills      = skill_refs(block_skills(id)),
            inputs      = nullify(type_inputs(id)),
            arguments   = nullify(arg_specs(meta$arguments[[1L]])),
            examples    = nullify(meta$examples[[1L]])
          )
        )
      })
    },
    name        = "describe_block_type",
    description = paste(
      "Report the full construction detail for one registered block",
      "type: its description, model-facing `guidance`, an `arguments`",
      "map (each argument's description and, when the block declares",
      "one, a JSON-Schema `type` descriptor such as an enum's allowed",
      "values), and `examples` -- complete worked configurations keyed",
      "by argument name. The per-type drill-down companion to",
      "list_block_types: pick a type from that lean list, then",
      "call this before configuring it with add_block. Any `skills`",
      "named alongside are this deployment's convention for the type --",
      "more specific than the package's `guidance` and winning where",
      "the two differ; load one with read_skill."
    ),
    arguments   = list(
      id = ellmer::type_string(
        "Block type id, as returned by list_block_types."
      )
    )
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

tool_get_block_conditions <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("get_block_conditions", {

        blks <- isolate(board$blocks)

        if (!id %in% names(blks)) {
          return(
            sprintf(
              "No block with id %s. Call list_blocks first.", id
            )
          )
        }

        conditions <- blks[[id]]$server$conditions

        if (is.null(conditions)) {
          return(
            sprintf("Block %s has no condition state to report yet.", id)
          )
        }

        format_conditions(isolate(conditions()), id)
      })
    },
    name        = "get_block_conditions",
    description = paste(
      "Return a block's currently captured conditions -- the errors,",
      "warnings and messages raised across its evaluation phases --",
      "grouped by severity and noting the phase each came from. The",
      "sibling of get_block_result for an unhealthy block: a block that",
      "errors on eval leaves its result empty, so the actual message",
      "surfaces only here. Reports no active conditions when the block",
      "is healthy."
    ),
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}

tool_query_data <- function(board, update, session) {

  ellmer::tool(
    function(code) {
      with_tool_errors("query_data", {

        blks <- isolate(board$blocks)

        data <- list()
        skipped <- character()

        for (id in names(blks)) {

          res <- tryCatch(
            isolate(blks[[id]]$server$result()),
            error = function(e) e
          )

          if (inherits(res, "error")) {
            skipped <- c(skipped, id)
          } else {
            data[[id]] <- res
          }
        }

        env <- eval_env(data)
        parsed <- parse(text = code)

        output <- capture.output({
          val <- NULL
          for (e in parsed) {
            val <- eval(e, envir = env)
          }
          if (!is.null(val)) {
            print(val)
          }
        })

        if (length(output) > 200L) {
          hidden <- length(output) - 200L
          output <- c(
            output[seq_len(200L)],
            sprintf("(output truncated; %d lines hidden)", hidden)
          )
        }

        if (length(skipped)) {
          output <- c(
            sprintf(
              "(skipped blocks with errors: %s)",
              paste(skipped, collapse = ", ")
            ),
            "",
            output
          )
        }

        paste(output, collapse = "\n")
      })
    },
    name        = "query_data",
    description = paste(
      "Evaluate R code against the board's block results. Every",
      "committed block's evaluated result is bound in scope by its",
      "block id (e.g. for a block with id `data` write `head(data)`).",
      "Returns captured stdout plus the auto-printed value of the",
      "last expression -- the same shape an R REPL would produce.",
      "Use this for questions the Board section doesn't carry:",
      "unique values, group counts, ad-hoc filters, joins across",
      "blocks. Read-only; the board is not modified."
    ),
    arguments = list(
      code = ellmer::type_string(
        paste(
          "R code to evaluate. Multiple statements allowed; the",
          "last expression's value is auto-printed."
        )
      )
    )
  )
}
