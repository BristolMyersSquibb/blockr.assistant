# What a board actually does: the writer hands back a string that is written
# to a file, and the reader takes that path. Reaching for core's seam rather
# than naming the encoder keeps this honest if core swaps it again.
via_board_file <- function(x) {

  path <- tempfile(fileext = ".json")
  on.exit(unlink(path), add = TRUE)

  writeLines(blockr.core:::write_json(x), path)

  blockr.core:::read_json(path)
}

round_trip <- function(store, save_turns = Inf) {

  threads <- serialize_chat_threads(store, save_turns)

  if (is.null(threads)) {
    return(NULL)
  }

  deserialize_chat_history(via_board_file(threads))
}

deser_with_history <- function(blob) {

  ser <- blockr.core::blockr_ser(
    new_assistant_extension(),
    data = list(history = blob)
  )

  blockr.core::blockr_deser(via_board_file(ser))
}

seeds <- function(blob) {
  environment(blockr.dock::extension_server(deser_with_history(blob)))
}

# Mirrors how shinychat groups turns into record nodes: a node is a run of
# consecutive same-role turns, so the tree alternates user and assistant.
fake_thread <- function(turns, id = "c_1", updated = "2026-08-27T10:00:00Z",
                        values = list()) {

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
    values = values, bookmark_state_id = NULL
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
