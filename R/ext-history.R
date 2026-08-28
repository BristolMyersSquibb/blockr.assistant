# A conversation record is a plain list, so the whole thread set round-trips
# through one serializeJSON() blob -- the same encoding a single conversation
# already used. Only the four methods below are ever asked for, so where the
# blob lands stays this package's decision rather than something the history
# UI can see.
new_thread_store <- function(threads = list()) {
  thread_store_class$new(threads)
}

thread_store_class <- R6::R6Class(
  "ThreadStore",
  inherit = shinychat::ConversationStore,
  private = list(
    convs = NULL
  ),
  public = list(

    initialize = function(threads = list()) {
      private$convs <- threads
    },

    threads = function() {
      private$convs
    },

    list = function(partition) {

      metas <- lapply(
        private$convs,
        function(rec) {
          list(
            id         = rec[["id"]],
            title      = rec[["title"]],
            created_at = rec[["created_at"]],
            updated_at = rec[["updated_at"]],
            size_bytes = thread_bytes(rec)
          )
        }
      )

      metas[order(chr_xtr(metas, "updated_at"), decreasing = TRUE)]
    },

    get = function(partition, id) {
      private$convs[[id]]
    },

    put = function(partition, record) {
      private$convs[[record[["id"]]]] <- record
      invisible(NULL)
    },

    delete = function(partition, id) {
      private$convs[[id]] <- NULL
      invisible(NULL)
    }
  )
)

# Reported on every history update, so it approximates rather than serialising
# each thread afresh every time the model answers.
thread_bytes <- function(record) {
  as.double(utils::object.size(record))
}

# A board saved before threads existed carries its conversation on the client
# and nowhere else: shinychat records it only once the model answers, so a
# board reopened and saved again without a word would drop it. Saving turns
# it into a thread instead. The transcript is built here rather than left to
# shinychat's fallback, which fabricates a single message per node and would
# collapse the whole conversation into one.
migrated_thread <- function(turns, stamp = utc_stamp()) {

  groups <- split(turns, cumsum(role_runs(turns)))

  nodes <- list()
  prev  <- NULL

  for (i in seq_along(groups)) {

    nid <- sprintf("n_%04d", i)

    nodes[[nid]] <- list(
      parent = prev,
      children = list(),
      turns = lapply(groups[[i]], ellmer::contents_record),
      ui = transcript_messages(groups[[i]]),
      selected_child = NULL
    )

    if (!is.null(prev)) {
      nodes[[prev]][["children"]] <- list(nid)
    }

    prev <- nid
  }

  list(
    schema_version = 1L,
    id = "c_restored",
    title = "Restored conversation",
    title_source = NULL,
    response_count = 0L,
    created_at = stamp,
    updated_at = stamp,
    client_info = list(),
    current_leaf = prev,
    nodes = nodes,
    values = list(),
    bookmark_state_id = NULL
  )
}

# One node per run of same-role turns, matching how shinychat records a live
# conversation, so a migrated thread trims and navigates like any other.
role_runs <- function(turns) {

  roles <- chr_ply(turns, function(turn) turn@role)

  c(TRUE, roles[-1L] != roles[-length(roles)])
}

transcript_messages <- function(turns) {

  lapply(
    shown_turns(turns),
    function(turn) {
      list(
        role = turn@role,
        segments = list(
          list(content = turn_text(turn), content_type = "markdown")
        )
      )
    }
  )
}

utc_stamp <- function() {
  format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
}

# The save budget counts turns within a thread, as it did when there was only
# one. Trimming happens at node boundaries: a node is a run of same-role turns,
# so cutting between them cannot split a tool call from its result. Any node
# left unreachable by the cut goes too, branches included, which is why a
# trimmed thread loses alternative branches older than the cut.
trim_thread <- function(record, save_turns) {

  if (is.infinite(save_turns)) {
    return(record)
  }

  path <- thread_path(record)
  kept <- character()
  total <- 0L

  for (node_id in rev(path)) {

    n <- length(record[["nodes"]][[node_id]][["turns"]])

    if (length(kept) && total + n > save_turns) {
      break
    }

    kept  <- c(node_id, kept)
    total <- total + n
  }

  kept <- drop_leading_replies(record, kept)

  if (!length(kept)) {
    return(NULL)
  }

  reroot_thread(record, kept)
}

# A provider rejects a conversation that opens on a reply, so a cut that lands
# mid-exchange is advanced forward to the next thing the user said.
drop_leading_replies <- function(record, kept) {

  while (length(kept) && !opens_on_user(record[["nodes"]][[kept[1L]]])) {
    kept <- kept[-1L]
  }

  kept
}

# A recorded turn carries its role in `class` rather than a prop, and a tool
# result is a user turn too -- one that means nothing without the request that
# produced it, which a cut here would have left behind.
opens_on_user <- function(node) {

  turns <- node[["turns"]]

  if (!length(turns)) {
    return(FALSE)
  }

  identical(turns[[1L]][["class"]], "ellmer::UserTurn") &&
    !has_content(turns[[1L]], "ellmer::ContentToolResult")
}

reroot_thread <- function(record, kept) {

  nodes <- record[["nodes"]][kept]

  nodes[[1L]][["parent"]] <- NULL

  for (i in seq_along(nodes)) {
    nodes[[i]][["children"]] <- as.list(intersect(
      unlst(nodes[[i]][["children"]]),
      kept
    ))
  }

  record[["nodes"]] <- nodes
  record[["current_leaf"]] <- kept[length(kept)]

  record
}

thread_path <- function(record) {

  leaf <- record[["current_leaf"]]

  if (is.null(leaf)) {
    return(character())
  }

  ids  <- character()
  seen <- character()

  while (!is.null(leaf) && !leaf %in% seen) {
    seen <- c(seen, leaf)
    ids  <- c(leaf, ids)
    leaf <- record[["nodes"]][[leaf]][["parent"]]
  }

  ids
}
