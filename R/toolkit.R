#' The assistant's tool kit for one board session
#'
#' Builds the same ellmer tools that `blockr.assistant`'s chat panel registers
#' with its model, against the same board handle, and wires the same
#' stage-and-commit cycle: mutation tools stage into a pending payload, `commit`
#' flushes it through core's `update` channel and answers with the board's
#' re-evaluation report. Nothing here is a second implementation of a tool; the
#' registration functions are the assistant's own, called with a tool bag in
#' place of the chat client.
#'
#' Must be called inside a Shiny module server (it registers observers on the
#' calling reactive domain).
#'
#' This is the half of the chat extension that is not about being a chat. The
#' panel builds one of these and puts a model in front of it; the agent access
#' extension builds one and puts HTTP in front of it. Neither knows about the
#' other, and the staging and commit cycle is written once.
#'
#' @param board Read-only board handle as handed to a dock extension server.
#' @param update Core's `update` channel (a reactiveVal).
#' @param view_data Reactive holding the dock's live layout, or `NULL`.
#' @param extensions The dock extensions handle, or `NULL`.
#' @param session The module session.
#'
#' @return A list with `tools()` (the live named list of `ellmer::ToolDef`),
#'   `summary()` (the board summary the assistant puts in its prompt),
#'   `pending` (the staging reactiveVal) and `pool` (the typed block tool
#'   pool).
#' @export
agent_toolkit <- function(board, update, view_data = NULL, extensions = NULL,
                          session = shiny::getDefaultReactiveDomain()) {

  pending <- shiny::reactiveVal(empty_pending())
  touched <- shiny::reactiveVal(character())
  added   <- shiny::reactiveVal(character())

  state <- new.env(parent = emptyenv())
  state$awaiting <- FALSE
  state$resolve  <- NULL
  state$baseline <- NULL
  state$gen      <- 0L

  settle <- function(msg) {
    if (is.null(state$resolve)) {
      return(invisible(FALSE))
    }
    res <- state$resolve
    state$resolve  <- NULL
    state$awaiting <- FALSE
    res(msg)
    invisible(TRUE)
  }

  # Blocks the commit touched, read off core's update channel once
  # preprocessing has expanded removals into their link cleanups.
  shiny::observeEvent(update(), {
    if (state$awaiting) {
      upd <- shiny::isolate(update())
      touched(union(
        shiny::isolate(touched()),
        touched_blocks(upd, shiny::isolate(board$board))
      ))
      added(union(shiny::isolate(added()), added_blocks(upd)))
    }
  })

  flush_review <- function() {
    format_flush_feedback(
      list(ok = TRUE),
      added_conditions(state$baseline, shiny::isolate(board$conditions())),
      collect_touched_results(
        shiny::isolate(touched()), board, shiny::isolate(added())
      ),
      header = commit_header()
    )
  }

  # Core records the outcome of every applied payload; a rejected one answers
  # at once, an accepted one after the re-evaluation it triggered has drained.
  shiny::observeEvent(board$last_update, {
    outcome <- board$last_update
    if (is.null(outcome) || !state$awaiting) {
      return()
    }
    if (isFALSE(outcome$ok)) {
      settle(format_flush_feedback(
        outcome, header = commit_reject_header(outcome$phase)
      ))
      return()
    }
    session$onFlushed(
      function() {
        settle(coal(flush_review(), commit_clean_note(),
                            fail_all = FALSE))
      },
      once = TRUE
    )
  }, ignoreNULL = TRUE)

  perform_commit <- function() {

    if (!has_any_changes(shiny::isolate(pending()))) {
      return(paste(
        "Nothing is staged. Stage changes with the mutation tools,",
        "then commit."
      ))
    }

    touched(character())
    added(character())
    state$awaiting <- TRUE

    promises::promise(function(resolve, reject) {
      state$baseline <- shiny::isolate(board$conditions())
      state$resolve  <- resolve
      state$gen      <- state$gen + 1L
      gen <- state$gen
      later::later(
        function() {
          if (identical(gen, state$gen)) settle(commit_timeout_note())
        },
        delay = commit_timeout_secs()
      )
      flush_pending(pending, update)
    })
  }

  bag  <- new_tool_bag()
  pool <- new_block_tool_pool(bag, board, pending, session)

  register_read_tools(bag, board, update, session, pool)
  register_mutation_tools(bag, board, pending, session)
  register_view_tools(bag, board, pending, view_data, session)
  register_board_options_tools(bag, board, session)
  register_skill_tools(bag)
  register_commit_tool(bag, perform_commit)
  register_discard_tool(bag, pending)

  if (inherits(shiny::isolate(board$board), "dock_board")) {
    register_extension_tools(bag, board, pending, extensions, session)
  }

  list(
    tools   = bag$get_tools,
    summary = function() summarise_board(board, view_data),
    # What the chat panel puts in its system prompt: how to work the board,
    # plus the catalogue of deployment-authored skills. An outside harness
    # holds the same tools; without this it holds no instructions for them.
    instructions = function() {
      default_system_prompt(
        board = board, view_data = view_data,
        skills = skill_catalogue()
      )
    },
    pending = pending,
    pool    = pool
  )
}

# What the assistant's registration functions need from an ellmer chat: a
# place to put tools. The block tool pool arms and evicts typed tools through
# the same three methods, so the list stays live.
new_tool_bag <- function() {

  tools <- list()

  name_tools <- function(x) {
    stats::setNames(x, vapply(x, function(t) t@name, character(1)))
  }

  list(
    register_tool = function(tool) {
      tools[[tool@name]] <<- tool
      invisible()
    },
    get_tools = function() tools,
    set_tools = function(x) {
      tools <<- name_tools(unname(as.list(x)))
      invisible()
    }
  )
}
