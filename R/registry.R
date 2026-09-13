#' Where open boards announce themselves
#'
#' A board lives in a Shiny session, and nothing outside the app can enumerate
#' those: Shiny publishes no list and session tokens are random. So a board that
#' wants to be reachable has to say so. Each session writes one small file here
#' while it is open, and removes it when it closes.
#'
#' A directory, deliberately. It has to be readable by a different process than
#' the one that wrote it -- the facade, or another R process on the same
#' machine -- and on Connect by a different content item, where the shared mount
#' is what both can see. Anything cleverer would buy nothing.
#'
#' @return Path to the registry directory, created if missing.
#' @export
agent_registry_dir <- function() {
  dir <- getOption(
    "blockr.agent_registry",
    Sys.getenv("BLOCKR_AGENT_REGISTRY", "~/.blockr/agent-boards")
  )
  dir <- path.expand(dir)
  if (!dir.exists(dir)) {
    dir.create(dir, recursive = TRUE, showWarnings = FALSE)
  }
  dir
}

# One file per session, named by its token, so a session can only ever rewrite
# or remove its own entry and two apps cannot collide.
registry_file <- function(token) {
  file.path(agent_registry_dir(), paste0(substr(token, 1, 32), ".json"))
}

#' Announce a board, and keep announcing it
#'
#' Writes this session's entry and refreshes it on a timer, so a reader can
#' tell a live board from one whose process died without getting to clean up.
#' Removes the entry when the session ends.
#'
#' @param session The Shiny session.
#' @param url The session's tool endpoint.
#' @param cookie Routing cookies, or `""` where nothing needs pinning.
#' @param board_name What to call it in a list.
#' @param heartbeat_secs How often to refresh `last_seen`.
#' @return Invisibly, the entry written.
#' @noRd
register_board <- function(session, url, cookie = "", board_name = NULL,
                           heartbeat_secs = 30) {

  token <- session$token

  entry <- function() {
    list(
      id         = substr(token, 1, 8),
      session    = token,
      url        = url,
      cookie     = cookie,
      # NULL on a local app, set on Connect. A reader filters on it when it is
      # there and shows everything when it is not, which is right on a machine
      # that belongs to one person.
      user       = session$user %||% "",
      board      = board_name %||% "",
      pid        = Sys.getpid(),
      opened_at  = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
      last_seen  = format(Sys.time(), "%Y-%m-%dT%H:%M:%S")
    )
  }

  write_entry <- function() {
    tryCatch(
      writeLines(
        jsonlite::toJSON(entry(), auto_unbox = TRUE), registry_file(token)
      ),
      error = function(e) {
        warning("could not write the board registry entry: ",
                conditionMessage(e), call. = FALSE)
      }
    )
  }

  write_entry()

  shiny::observe({
    shiny::invalidateLater(heartbeat_secs * 1000)
    write_entry()
  })

  session$onSessionEnded(function() {
    unlink(registry_file(token))
  })

  invisible(entry())
}

#' The boards on offer
#'
#' Reads every entry, drops the ones that have stopped announcing themselves,
#' and optionally keeps only one user's.
#'
#' @param user Keep only entries belonging to this user. `NULL` or `""` keeps
#'   all of them, which is what a local machine wants.
#' @param stale_secs An entry not refreshed within this many seconds is treated
#'   as gone. A session removes its own entry when it closes; this is for the
#'   process that died without the chance.
#' @return A list of entries, most recently seen first.
#' @export
list_boards <- function(user = NULL, stale_secs = 120) {

  files <- list.files(agent_registry_dir(), pattern = "\\.json$",
                      full.names = TRUE)

  entries <- lapply(files, function(f) {
    tryCatch(jsonlite::fromJSON(f, simplifyVector = FALSE),
             error = function(e) NULL)
  })

  entries <- Filter(Negate(is.null), entries)

  fresh <- vapply(entries, function(e) {
    seen <- suppressWarnings(as.POSIXct(e$last_seen, format = "%Y-%m-%dT%H:%M:%S"))
    !is.na(seen) && difftime(Sys.time(), seen, units = "secs") < stale_secs
  }, logical(1))

  entries <- entries[fresh]

  if (!is.null(user) && nzchar(user)) {
    entries <- Filter(function(e) identical(e$user, user), entries)
  }

  entries[order(vapply(entries, `[[`, "", "last_seen"), decreasing = TRUE)]
}
