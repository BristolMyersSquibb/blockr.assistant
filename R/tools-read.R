register_read_tools <- function(client, board, update, session, pool = NULL) {

  client$register_tool(tool_list_blocks(board, update, session))
  client$register_tool(tool_describe_block(board, update, session, pool))
  client$register_tool(tool_list_links(board, update, session))
  client$register_tool(tool_list_stacks(board, update, session))
  client$register_tool(tool_describe_stack(board, update, session))
  client$register_tool(
    tool_list_block_types(board, update, session)
  )
  client$register_tool(
    tool_describe_block_type(board, update, session, pool)
  )
  client$register_tool(
    tool_get_block_result(board, update, session)
  )
  client$register_tool(
    tool_get_block_state(board, update, session)
  )
  client$register_tool(
    tool_get_block_conditions(board, update, session)
  )
  client$register_tool(tool_inspect_results(board, update, session))

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
              package = character(),
              status  = character()
            )
          )
        }

        meta <- block_metadata(blks)

        data.frame(
          id      = names(blks),
          type    = chr_ply(blks, function(x) class(x)[[1L]]),
          name    = meta$name,
          package = meta$package,
          status  = chr_ply(names(blks), eval_status, board),
          row.names = NULL
        )
      })
    },
    name        = "list_blocks",
    description = paste(
      "List all blocks on the board. One row per block: id, type",
      "(class name), display name, source package, and eval status.",
      "A `ready` block has a current result; `dormant` and `stale`",
      "blocks are off screen and hold no readable result (`stale`",
      "additionally means an upstream changed since the block last",
      "ran); `waiting`, `unset` and `failed` blocks have not produced",
      "one. Call describe_block for what a status means for that",
      "block."
    ),
    arguments   = list()
  )
}

tool_describe_block <- function(board, update, session, pool = NULL) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_block", {

        brd <- isolate(board$board)
        blks <- board_blocks(brd)

        if (!id %in% names(blks)) {
          return(
            glue::glue("No block with id {id}. Call list_blocks first.")
          )
        }

        summary <- truncate_chars(
          paste(
            describe_block(
              blks[[id]], board = brd, id = id,
              state = summary_block_state(id, board)
            ),
            collapse = "\n"
          ),
          summary_max_chars(),
          hint = state_tool_hint()
        )

        type <- registry_id_from_block(blks[[id]])

        paste(
          c(
            summary,
            eval_status_line(eval_status(id, board)),
            skill_lines(block_skills(type)),
            arm_block_tool(pool, "modify", type)
          ),
          collapse = "\n"
        )
      })
    },
    name        = "describe_block",
    description = paste(
      "Describe a block currently on the board: its class chain,",
      "name, arguments and current values, external-control",
      "declaration, incoming links, eval status (whether it holds a",
      "current result, and if not why), and any deployment-authored",
      "`skills` scoped to its type. The state section is a bounded",
      "summary: an argument too long to show is omitted and marked",
      "rather than shown in part, so read it with get_block_state",
      "before rewriting it. Calling this also registers a",
      "typed modify_<type> tool where the block's type declares one,",
      "named on the last line; call that in preference to",
      "modify_block."
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
            glue::glue("No stack with id {id}. Call list_stacks first.")
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
      description = arg_spec_description(x),
      type = arg_spec_type(x)
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

tool_describe_block_type <- function(board, update, session, pool = NULL) {

  ellmer::tool(
    function(id) {
      with_tool_errors("describe_block_type", {

        if (!id %in% list_blocks()) {
          return(
            glue::glue(
              "No registered block type '{id}'. ",
              "Call list_block_types first."
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
            examples    = nullify(meta$examples[[1L]]),
            typed_tool  = arm_block_tool(pool, "add", id)
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
      "call this before configuring it. Doing so registers a typed",
      "add_<type> tool where the type declares one, reported back as",
      "`typed_tool`; call that in preference to add_block. Any",
      "`skills` named alongside are this deployment's convention for",
      "the type -- more specific than the package's `guidance` and",
      "winning where the two differ; load one with read_skill."
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
            glue::glue("No block with id {id}. Call list_blocks first.")
          )
        }

        block_result_summary(id, board)
      })
    },
    name        = "get_block_result",
    description = paste(
      "Return a short text summary of a block's current evaluated",
      "output. Data frames are summarised with skimr-style stats;",
      "other objects fall back to a truncated print. A block that",
      "holds no readable result reports its eval status and what",
      "that status means instead -- an off-screen (`dormant` or",
      "`stale`) block is not a broken block and does not need",
      "reconfiguring."
    ),
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}

tool_get_block_state <- function(board, update, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("get_block_state", {

        blks <- board_blocks(isolate(board$board))

        if (!id %in% names(blks)) {
          return(
            glue::glue("No block with id {id}. Call list_blocks first.")
          )
        }

        state <- live_block_state(id, board)

        if (is.null(state)) {
          return(
            glue::glue(
              "Block {id} holds no live state -- it has not been ",
              "constructed on this board. Call describe_block for the ",
              "values it was constructed with."
            )
          )
        }

        list(id = id, values = bound_state_values(state))
      })
    },
    name        = "get_block_state",
    description = paste(
      "Return one block's argument values in full -- the detail tier",
      "behind the bounded state section describe_block carries. Values",
      "come back as the board holds them rather than through an R",
      "structure summary, so a long argument (a code block's `script`,",
      "a filter expression, a document's text) arrives whole where that",
      "section omits it. Call this before rewriting any argument you",
      "have only seen summarised: modify_block replaces the whole",
      "value, so an edit made from a summary silently discards what the",
      "summary left out. Configuration only -- use get_block_result or",
      "inspect_results for a block's data."
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
            glue::glue("No block with id {id}. Call list_blocks first.")
          )
        }

        conditions <- blks[[id]]$server$conditions

        if (is.null(conditions)) {
          return(
            glue::glue("Block {id} has no condition state to report yet.")
          )
        }

        paste(
          c(
            deferred_conditions_caveat(id, eval_status(id, board)),
            format_conditions(isolate(conditions()), id)
          ),
          collapse = "\n\n"
        )
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
      "is healthy -- except for an off-screen (`dormant` or `stale`)",
      "block, which is not re-evaluating, so its conditions are a",
      "snapshot from its last run and an empty report means unknown,",
      "not healthy. The response says so when that is the case."
    ),
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}

# A scope miss is the one error the model can fix unaided, so the fix is named
# on the error rather than only in the tool description -- which it has already
# read by the time it gets this wrong.
with_scope_hint <- function(expr) {

  tryCatch(
    expr,
    error = function(e) {

      msg <- conditionMessage(e)

      stop(paste(c(msg, scope_hint(msg)), collapse = " -- "), call. = FALSE)
    }
  )
}

# Deliberately says nothing about what IS in scope. The board's eval_env()
# attaches the default packages or not according to its own option, which we
# do not read here, so any claim about the scope's contents would be a guess.
# The name of the package exporting the missing function is both narrower and
# more useful, and it is knowable: R's own defaultPackages are exactly the set
# `attach_default_packages` governs, so a miss is almost always one of them.
scope_hint <- function(msg) {

  fun <- sub('.*could not find function "([^"]+)".*', "\\1", msg)

  if (identical(fun, msg)) {
    return(NULL)
  }

  pkg <- Find(
    function(p) fun %in% getNamespaceExports(asNamespace(p)),
    intersect(getOption("defaultPackages"), loadedNamespaces())
  )

  if (is.null(pkg)) {
    return("a function from another package needs its namespace prefix here")
  }

  glue::glue("prefix the package it comes from: {pkg}::{fun}()")
}

tool_inspect_results <- function(board, update, session) {

  ellmer::tool(
    function(code, width = NULL, height = NULL) {
      with_tool_errors("inspect_results", {

        blks <- isolate(board$blocks)

        data <- list()
        skipped <- character()

        for (id in names(blks)) {

          status <- eval_status(id, board)

          if (has_no_result(status)) {
            skipped <- c(skipped, set_names(status, id))
            next
          }

          res <- tryCatch(
            isolate(blks[[id]]$server$result()),
            error = function(e) e
          )

          if (inherits(res, "error")) {
            skipped <- c(skipped, set_names(status, id))
          } else {
            data[[id]] <- res
          }
        }

        env <- eval_env(data)
        parsed <- parse(text = code)

        # REPL semantics, unchanged: stdout is captured and the last value is
        # auto-printed. The device is simply open while that happens, so a
        # value whose print method draws (a ggplot, a recordedplot) draws onto
        # it, exactly as the same code would at a console.
        drawn <- with_scope_hint(capture_drawings(
          function() {
            capture.output({
              val <- NULL
              for (e in parsed) {
                val <- eval(e, envir = env)
              }
              if (!is.null(val)) {
                print(val)
              }
            })
          },
          width  = device_px(width),
          height = device_px(height)
        ))

        on.exit(unlink(drawn$dir, recursive = TRUE), add = TRUE)

        output <- drawn$value

        if (length(output) > 200L) {
          hidden <- length(output) - 200L
          output <- c(
            output[seq_len(200L)],
            glue::glue("(output truncated; {hidden} lines hidden)")
          )
        }

        max_plots <- plot_render_max()
        shown <- head(drawn$files, max_plots)

        if (length(shown)) {
          output <- c(
            output, dropped_drawings_line(length(drawn$files), max_plots)
          )
        }

        if (length(skipped)) {
          output <- c(skipped_block_lines(skipped), "", output)
        }

        text <- paste(output, collapse = "\n")

        if (!length(shown)) {
          return(text)
        }

        # A tool result expands into content only when EVERY element of it is
        # a Content object, so the text travels as ContentText rather than as
        # a bare string beside the images.
        c(
          if (nzchar(trimws(text))) list(ellmer::ContentText(text)),
          drawing_contents(shown)
        )
      })
    },
    name        = "inspect_results",
    description = paste(
      "Evaluate R code against the board's block results. Every",
      "committed block's evaluated result is bound in scope by its",
      "block id (e.g. for a block with id `data` write `head(data)`).",
      "Returns captured stdout plus the auto-printed value of the",
      "last expression -- the same shape an R REPL would produce.",
      "A block holding no readable result is not bound; those are",
      "listed with their eval status above the output, so a name",
      "that is missing from scope is explained rather than silent.",
      "Code runs in the board's evaluation scope, which need not have",
      "anything beyond base R attached, so prefix every function from",
      "another package -- graphics::hist(), stats::median(),",
      "ggplot2::ggplot(). A prefixed call resolves whatever the board",
      "is configured to attach, and is what you would write in a code",
      "block anyway.",
      "The call runs with a graphics device open, so whatever the code",
      "draws comes back as an image beside the text -- a plot() call,",
      "an auto-printed ggplot or lattice object, grid output, or an",
      "auto-printed plot recording. Drawing is the whole mechanism;",
      "there is no separate argument asking for a picture. Note that a",
      "plot block evaluates to a list of recordings rather than to one,",
      "so auto-print an element of it (`chart[[1]]`) to see the chart.",
      "Use this for questions the Board section doesn't carry: unique",
      "values, group counts, ad-hoc filters, joins across blocks, and",
      "anything you need to see drawn rather than described.",
      "Read-only; the board is not modified."
    ),
    arguments = list(
      code = ellmer::type_string(
        paste(
          "R code to evaluate. Multiple statements allowed; the",
          "last expression's value is auto-printed."
        )
      ),
      width = ellmer::type_integer(
        paste(
          "Width in pixels of the device the code draws on. Optional;",
          "defaults to 768, clamped to 200-2000. Raise it for a dense",
          "plot you need to read values off, lower it when the shape is",
          "all you need."
        ),
        required = FALSE
      ),
      height = ellmer::type_integer(
        paste(
          "Height in pixels of the device the code draws on. Optional;",
          "defaults to 768, clamped to 200-2000."
        ),
        required = FALSE
      )
    )
  )
}
