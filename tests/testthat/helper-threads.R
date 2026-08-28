# Mirrors how shinychat groups turns into record nodes: a node is a run of
# consecutive same-role turns, so the tree alternates user and assistant.
fake_thread <- function(turns, id = "c_1", updated = "2026-08-27T10:00:00Z") {

  recs   <- lapply(turns, ellmer::contents_record)
  groups <- split(recs, cumsum(role_runs(turns)))

  nodes <- list()
  prev  <- NULL

  for (i in seq_along(groups)) {

    nid <- sprintf("n_%04d", i)

    nodes[[nid]] <- list(
      parent = prev, children = list(), turns = unname(groups[[i]]),
      ui = list(list(role = "user", segments = list())),
      selected_child = NULL
    )

    if (!is.null(prev)) {
      nodes[[prev]][["children"]] <- list(nid)
    }

    prev <- nid
  }

  list(
    schema_version = 1L, id = id, title = paste("Thread", id),
    title_source = NULL, response_count = length(groups),
    created_at = "2026-08-27T09:00:00Z", updated_at = updated,
    client_info = list(), current_leaf = prev, nodes = nodes,
    values = list(), bookmark_state_id = NULL
  )
}

thread_turns <- function(record) {
  unlst(
    lapply(
      thread_path(record),
      function(id) record[["nodes"]][[id]][["turns"]]
    ),
    recursive = FALSE
  )
}
