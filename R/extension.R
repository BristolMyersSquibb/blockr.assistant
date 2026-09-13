#' Agent access extension
#'
#' A dock extension that publishes the assistant's tool kit for the open
#' session at a per-session URL and shows that URL in its panel, so an
#' external harness (Claude Code through the facade in `inst/facade`, or a
#' plain `curl`) can drive this board the way the in-app assistant does.
#'
#' @param ... Forwarded to [blockr.dock::new_dock_extension()].
#'
#' @return A `dock_extension`.
#' @export
new_agent_access_extension <- function(...) {
  blockr.dock::new_dock_extension(
    server = agent_ext_srv,
    ui = agent_ext_ui,
    name = "Agent",
    class = "agent_access_extension",
    ...
  )
}

agent_ext_srv <- function(id, board, update, view_data = NULL,
                          extensions = NULL, ...) {
  shiny::moduleServer(id, function(input, output, session) {

    kit  <- agent_toolkit(board, update, view_data, extensions, session)
    path <- register_tool_endpoint(kit, session)

    url_r <- shiny::reactive({
      cd <- session$clientData
      paste0(
        cd$url_protocol, "//", cd$url_hostname,
        if (nzchar(cd$url_port)) paste0(":", cd$url_port) else "",
        sub("/$", "", cd$url_pathname), "/", path
      )
    })

    # The routing cookies this browser was given. Read once at mount: they
    # address a process, and the process is what the session is pinned to for
    # as long as it lives.
    cookie <- affinity_cookie(session)

    token_r <- shiny::reactive(connection_token(url_r(), cookie))

    # Announce this board, so something outside can find it without being
    # handed an address by hand.
    shiny::observeEvent(url_r(), {
      register_board(
        session, url_r(), cookie,
        board_name = tryCatch(
          blockr.core::board_option_value("board_name", board$board),
          error = function(e) NULL
        )
      )
    }, once = TRUE)

    output$token <- shiny::renderUI({
      tok <- token_r()
      shiny::tagList(
        shiny::tags$code(class = "agent-url", tok),
        shiny::tags$button(
          class = "btn btn-sm btn-outline-secondary agent-copy",
          type = "button",
          onclick = sprintf(
            "navigator.clipboard.writeText(%s)", jsonlite::toJSON(tok)
          ),
          "Copy"
        )
      )
    })

    output$affinity <- shiny::renderText({

      if (nzchar(cookie)) {
        nm <- vapply(strsplit(trimws(strsplit(cookie, ";", fixed = TRUE)[[1]]),
                              "=", fixed = TRUE), `[`, "", 1L)
        return(sprintf("pinned by %s", paste(nm, collapse = ", ")))
      }

      # Nothing recognised. On a single-process app that is correct and there
      # is nothing to pin. Behind a load balancer it means the stickiness
      # cookie goes by a name this deployment has not been told about, so name
      # what the browser DID send -- names only, never values -- because that
      # list is where the right one is.
      sent <- session$request$HTTP_COOKIE

      if (is.null(sent) || !nzchar(sent)) {
        return("no cookies on this session -- nothing to pin, which is right on a single process")
      }

      nm <- vapply(strsplit(trimws(strsplit(sent, ";", fixed = TRUE)[[1]]),
                            "=", fixed = TRUE), `[`, "", 1L)

      sprintf(
        paste0("no routing cookie recognised. If this app runs several ",
               "processes, one of these pins it -- set ",
               "blockr.agent_affinity_cookies: %s"),
        paste(nm, collapse = ", ")
      )
    })

    output$url <- shiny::renderUI({
      url <- url_r()
      shiny::tagList(
        shiny::tags$code(class = "agent-url", url),
        shiny::tags$button(
          class = "btn btn-sm btn-outline-secondary agent-copy",
          type = "button",
          onclick = sprintf(
            "navigator.clipboard.writeText(%s)", jsonlite::toJSON(url)
          ),
          "Copy"
        )
      )
    })

    output$count <- shiny::renderText({
      board$board
      sprintf("%d tools", length(kit$tools()))
    })

    # Nothing of this extension rides in the saved board.
    list(state = list())
  })
}

agent_ext_ui <- function(id, board, ...) {
  shiny::div(
    class = "agent-panel",
    shiny::tags$style(shiny::HTML(
      ".agent-panel { padding: 10px 12px; font-size: 13px; }
       .agent-panel .agent-url { display: block; word-break: break-all;
         margin: 6px 0; user-select: all; }
       .agent-panel p { margin: 4px 0; }"
    )),
    shiny::p("Connection string for an outside harness. Copy it whole:"),
    shiny::uiOutput(shiny::NS(id, "token")),
    shiny::p(
      shiny::textOutput(shiny::NS(id, "count"), inline = TRUE), " \u00b7 ",
      shiny::textOutput(shiny::NS(id, "affinity"), inline = TRUE)
    ),
    shiny::tags$details(
      shiny::tags$summary("the URL on its own"),
      shiny::uiOutput(shiny::NS(id, "url"))
    )
  )
}
