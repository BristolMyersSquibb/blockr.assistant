# look_at: a picture of the board as the user's browser shows it. The text
# tools report that blocks evaluate; they cannot show an empty chart, a panel
# squeezed to a sliver, or plumbing controls stacked above a table. Only the
# user's browser holds the board as drawn, so the capture runs there
# (inst/js/look-at.js) and the tool waits for it, the way commit waits for the
# board.

look_at_enabled <- function() {
  isTRUE(blockr_option("assistant_look_at", FALSE))
}

look_at_timeout_secs <- function() {
  as.numeric(blockr_option("assistant_look_at_timeout_secs", 15))
}

look_at_dep <- function() {

  if (!look_at_enabled()) {
    return(NULL)
  }

  htmltools::htmlDependency(
    "blockr-assistant-look-at",
    utils::packageVersion("blockr.assistant"),
    src = c(file = system.file("js", package = "blockr.assistant")),
    script = c("snapdom.js", "look-at.js")
  )
}

# The in-flight captures, by request id. A model may ask for several pictures
# in one step, so each request keeps its own resolver and its own context. A
# reply whose id is no longer held belongs to a call that already timed out,
# and is dropped.
new_look_bridge <- function() {

  waiting <- list()
  last    <- 0L

  list(
    arm = function(resolver, context = NULL) {
      last <<- last + 1L
      waiting[[as.character(last)]] <<- list(
        resolve = resolver,
        context = context
      )
      last
    },
    context = function(id) {
      waiting[[as.character(id)]]$context
    },
    settle = function(id, value) {
      key <- as.character(id)
      held <- waiting[[key]]
      if (is.null(held)) {
        return(FALSE)
      }
      waiting[[key]] <<- NULL
      held$resolve(value)
      TRUE
    }
  )
}

look_at_timeout_note <- function() {
  paste(
    "No picture arrived from the browser. Carry on with the text tools",
    "(get_block_result, list_views)."
  )
}

look_at_error_note <- function(error, target) {

  if (identical(error, "not on screen")) {
    return(
      glue::glue(
        "Panel {target} is not drawn in the browser: it sits behind another ",
        "tab or in another view. Bring it to the front with focus_panel, ",
        "commit, then look again."
      )
    )
  }

  glue::glue("The browser could not take the picture: {error}")
}

look_at_png_prefix <- "^data:image/png;base64,"

# The browser's reply, as the tool result.
look_at_result <- function(reply, target, dir, staged = FALSE) {

  if (!is.null(reply$error)) {
    return(as.character(look_at_error_note(reply$error, target)))
  }

  if (!is.character(reply$png) || !grepl(look_at_png_prefix, reply$png)) {
    return("The browser sent something that is not a PNG.")
  }

  path <- tempfile("look-", tmpdir = dir, fileext = ".png")
  writeBin(
    jsonlite::base64_dec(sub(look_at_png_prefix, "", reply$png)),
    path
  )

  what <- if (identical(target, "view")) {
    "the board as the user sees it now"
  } else {
    glue::glue("panel {target} as the user sees it now")
  }

  note <- paste0(
    "Picture of ", what, ".",
    if (staged) {
      paste(
        " Staged changes are not in it: the picture shows the committed",
        "board."
      )
    }
  )

  c(list(ellmer::ContentText(note)), drawing_contents(path))
}

look_at_handle <- function(target, board, pending) {

  if (identical(target, "view")) {
    return(NULL)
  }

  sets <- panel_id_sets(board, pending)

  if (target %in% sets$blocks) {
    return(as.character(blockr.dock::as_block_handle_id(target)))
  }

  if (target %in% sets$exts) {
    return(as.character(blockr.dock::as_ext_handle_id(target)))
  }

  stop(
    glue::glue(
      "{target} is neither \"view\" nor a block or extension id on the board"
    ),
    call. = FALSE
  )
}

# Wire the bridge to the session: the observer that settles it, and the
# function the tool calls. `input_id` is namespaced for the browser, read
# bare on the server.
new_look_at <- function(board, pending, session) {

  bridge <- new_look_bridge()

  dir <- tempfile("look-at-")
  dir.create(dir)
  session$onSessionEnded(function() unlink(dir, recursive = TRUE))

  observeEvent(session$input$look_at_result, {

    reply <- session$input$look_at_result
    asked <- bridge$context(reply$id)

    if (is.null(asked)) {
      return()
    }

    bridge$settle(
      reply$id,
      look_at_result(reply, asked$target, dir, asked$staged)
    )
  })

  function(target) {

    handle <- look_at_handle(target, board, pending)
    staged <- has_any_changes(isolate(pending()))

    promises::promise(
      function(resolve, reject) {

        id <- bridge$arm(resolve, list(target = target, staged = staged))

        later::later(
          function() bridge$settle(id, look_at_timeout_note()),
          delay = look_at_timeout_secs()
        )

        session$sendCustomMessage(
          "blockr-assistant-look-at",
          list(
            id = id,
            input = session$ns("look_at_result"),
            handle = handle
          )
        )
      }
    )
  }
}

register_look_tool <- function(client, look) {

  if (is.null(look)) {
    return(invisible(client))
  }

  client$register_tool(tool_look_at(look))

  invisible(client)
}

tool_look_at <- function(look) {

  ellmer::tool(
    function(target = "view") {
      with_tool_errors("look_at", look(target))
    },
    name = "look_at",
    description = paste(
      "Take a picture of the board exactly as the user's browser shows it",
      "right now, and look at it. `target` is \"view\" for the whole screen,",
      "or a block or extension id for one panel with its tab strip. Use it",
      "to check what text cannot show, typically once after the last commit",
      "of a build: a panel with no content, a caption with an unresolved",
      "`{...}` or `@` slot, controls the user would never touch stacked",
      "above the output, a panel or side rail too narrow to read, a front",
      "tab that does not answer what the user asked. Fix what you find, or",
      "name it in your reply. Do not read exact numbers from the picture",
      "(use get_block_result), do not conclude anything about content below",
      "the fold, ignore scrollbars, and note that the grey line under a",
      "panel title is the block type, not a caption. Your own chat is left",
      "blank in the picture. Only what is on screen",
      "can be pictured: a panel behind another tab needs focus_panel and a",
      "commit first. The user sees the picture you took."
    ),
    arguments = list(
      target = ellmer::type_string(
        "\"view\" (default) or a block or extension id.",
        required = FALSE
      )
    )
  )
}
