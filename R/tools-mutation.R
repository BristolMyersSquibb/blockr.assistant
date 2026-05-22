register_mutation_tools <- function(client, board, pending, session) {

  client$register_tool(tool_add_block(board, pending, session))
  client$register_tool(tool_remove_block(board, pending, session))
  client$register_tool(tool_modify_block(board, pending, session))
  client$register_tool(tool_add_link(board, pending, session))
  client$register_tool(tool_remove_link(board, pending, session))
  client$register_tool(tool_modify_link(board, pending, session))
  client$register_tool(tool_add_stack(board, pending, session))
  client$register_tool(tool_remove_stack(board, pending, session))
  client$register_tool(tool_modify_stack(board, pending, session))

  invisible(client)
}

existing_ids <- function(board, pending, entity) {

  brd <- isolate(board$board)
  pen <- isolate(pending())

  live <- switch(
    entity,
    blocks = names(board_blocks(brd)),
    links  = names(board_links(brd)),
    stacks = names(board_stacks(brd)),
    stop("Unknown entity: ", entity)
  )

  ent <- pen[[entity]]
  unique(c(live, names(ent$add), names(ent$mod), ent$rm))
}

compact <- function(x) {
  x[!vapply(x, is.null, logical(1L))]
}

tool_add_block <- function(board, pending, session) {

  ellmer::tool(
    function(type, args, id = NULL) {
      with_tool_errors("add_block", {

        if (is.null(id) || !nzchar(id)) {
          id <- rand_names(existing_ids(board, pending, "blocks"))
        }

        parsed <- if (nzchar(args)) {
          jsonlite::fromJSON(args, simplifyVector = TRUE)
        } else {
          list()
        }

        block <- do.call(create_block, c(list(type), parsed))

        stage_block_add(pending, board, id, block)

        sprintf(
          "Staged add_block(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "add_block",
    description = paste(
      "Add a new block to the board. `type` is a block id as",
      "reported by list_available_blocks. `args` is a JSON object",
      "(passed as a string) of constructor arguments -- field",
      "names must match the arg names reported by",
      "list_available_blocks for the chosen type. `id` is optional",
      "-- if omitted, a unique id is generated."
    ),
    arguments = list(
      type = ellmer::type_string(
        "Block type id, from list_available_blocks."
      ),
      args = ellmer::type_string(
        paste(
          "JSON object of constructor arguments, e.g. '{\"n\": 10}'.",
          "Field names match list_available_blocks. Pass '{}' if",
          "the block has no required args."
        )
      ),
      id = ellmer::type_string(
        "Optional id for the new block. Generated if omitted.",
        required = FALSE
      )
    )
  )
}

tool_remove_block <- function(board, pending, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("remove_block", {

        stage_block_rm(pending, board, id)

        sprintf(
          "Staged remove_block(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "remove_block",
    description = paste(
      "Remove a block from the board. Any links to or from the",
      "block are cleaned up at apply time by core; the model does",
      "not need to remove them explicitly."
    ),
    arguments = list(
      id = ellmer::type_string("Block id to remove.")
    )
  )
}

tool_modify_block <- function(board, pending, session) {

  ellmer::tool(
    function(id, args) {
      with_tool_errors("modify_block", {

        delta <- jsonlite::fromJSON(args, simplifyVector = TRUE)

        stage_block_mod(pending, board, id, delta)

        sprintf(
          "Staged modify_block(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "modify_block",
    description = paste(
      "Change one or more constructor arguments of an existing",
      "block. `args` is a JSON object (passed as a string) of just",
      "the keys being changed; unmentioned keys keep their current",
      "values. Modifiable keys for a given block are those listed",
      "as externally controllable by describe_block (and",
      "`block_name`, always); non-controllable keys are rejected",
      "at stage time, in which case use remove_block + add_block."
    ),
    arguments = list(
      id = ellmer::type_string("Id of the block to modify."),
      args = ellmer::type_string(
        paste(
          "JSON object of arguments to change, e.g. '{\"n\": 5}'.",
          "Only supplied keys are modified."
        )
      )
    )
  )
}

tool_add_link <- function(board, pending, session) {

  ellmer::tool(
    function(from, to, input, id = NULL) {
      with_tool_errors("add_link", {

        if (is.null(id) || !nzchar(id)) {
          id <- rand_names(existing_ids(board, pending, "links"))
        }

        link <- new_link(from = from, to = to, input = input)

        stage_link_add(pending, board, id, link)

        sprintf(
          "Staged add_link(%s: %s -> %s$%s) -- will apply at turn end.",
          id, from, to, input
        )
      })
    },
    name        = "add_link",
    description = paste(
      "Add a link that wires the output of block `from` into",
      "argument `input` of block `to`. Both blocks must exist on",
      "the board or be staged for creation in this turn."
    ),
    arguments = list(
      from  = ellmer::type_string("Source block id."),
      to    = ellmer::type_string("Destination block id."),
      input = ellmer::type_string(
        "Input slot on the destination block."
      ),
      id = ellmer::type_string(
        "Optional id for the new link. Generated if omitted.",
        required = FALSE
      )
    )
  )
}

tool_remove_link <- function(board, pending, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("remove_link", {

        stage_link_rm(pending, board, id)

        sprintf(
          "Staged remove_link(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "remove_link",
    description = "Remove a link by its id.",
    arguments = list(
      id = ellmer::type_string("Link id to remove.")
    )
  )
}

tool_modify_link <- function(board, pending, session) {

  ellmer::tool(
    function(id, from = NULL, to = NULL, input = NULL) {
      with_tool_errors("modify_link", {

        delta <- compact(list(from = from, to = to, input = input))

        if (!length(delta)) {
          stop(
            "no fields supplied; pass at least one of from/to/input",
            call. = FALSE
          )
        }

        stage_link_mod(pending, board, id, delta)

        sprintf(
          "Staged modify_link(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "modify_link",
    description = paste(
      "Retarget an existing link. Any combination of `from`, `to`,",
      "and `input` may be supplied; only supplied fields are",
      "changed. Omitted fields keep their current values."
    ),
    arguments = list(
      id = ellmer::type_string("Id of the link to modify."),
      from = ellmer::type_string(
        "New source block id.",
        required = FALSE
      ),
      to = ellmer::type_string(
        "New destination block id.",
        required = FALSE
      ),
      input = ellmer::type_string(
        "New input slot on the destination block.",
        required = FALSE
      )
    )
  )
}

tool_add_stack <- function(board, pending, session) {

  ellmer::tool(
    function(blocks, name = NULL, id = NULL) {
      with_tool_errors("add_stack", {

        if (is.null(id) || !nzchar(id)) {
          id <- rand_names(existing_ids(board, pending, "stacks"))
        }

        stack <- if (is.null(name)) {
          new_stack(blocks = blocks)
        } else {
          new_stack(blocks = blocks, name = name)
        }

        stage_stack_add(pending, board, id, stack)

        sprintf(
          "Staged add_stack(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "add_stack",
    description = paste(
      "Group a set of blocks into a stack. `blocks` is a character",
      "vector of block ids; `name` is an optional human-readable",
      "label."
    ),
    arguments = list(
      blocks = ellmer::type_array(
        "Block ids to include in the stack.",
        items = ellmer::type_string()
      ),
      name = ellmer::type_string(
        "Optional display name for the stack.",
        required = FALSE
      ),
      id = ellmer::type_string(
        "Optional id for the new stack. Generated if omitted.",
        required = FALSE
      )
    )
  )
}

tool_remove_stack <- function(board, pending, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("remove_stack", {

        stage_stack_rm(pending, board, id)

        sprintf(
          "Staged remove_stack(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "remove_stack",
    description = paste(
      "Remove a stack. Member blocks are not removed; only the",
      "grouping disappears."
    ),
    arguments = list(
      id = ellmer::type_string("Stack id to remove.")
    )
  )
}

tool_modify_stack <- function(board, pending, session) {

  ellmer::tool(
    function(id, blocks = NULL, name = NULL) {
      with_tool_errors("modify_stack", {

        delta <- compact(list(blocks = blocks, name = name))

        if (!length(delta)) {
          stop(
            "no fields supplied; pass at least one of blocks/name",
            call. = FALSE
          )
        }

        stage_stack_mod(pending, board, id, delta)

        sprintf(
          "Staged modify_stack(%s) -- will apply at turn end.", id
        )
      })
    },
    name        = "modify_stack",
    description = paste(
      "Change a stack's member blocks and/or name. Either or both",
      "arguments may be omitted; only supplied fields are changed."
    ),
    arguments = list(
      id = ellmer::type_string("Stack id to modify."),
      blocks = ellmer::type_array(
        "New set of member block ids.",
        items    = ellmer::type_string(),
        required = FALSE
      ),
      name = ellmer::type_string(
        "New display name.",
        required = FALSE
      )
    )
  )
}
