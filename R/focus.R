# The block the user has selected in the board UI -- what an unqualified "this
# block" in the chat refers to. dock already reports the focused panel of the
# active view on `view_data()`'s grid (`focus`), which is where a click on a
# block card lands, so the selection is read rather than invented. Two things
# stand between that signal and what the user means:
#
#  * The chat panel is a dock panel too, so clicking into the message box moves
#    focus to the assistant's own panel. Only block panels are recorded, so the
#    block last clicked survives the trip to the input box -- which is the whole
#    point, since that click is the one the user makes on the way to typing.
#  * A selection the user dismissed has to stay dismissed. Clearing the chip
#    changes nothing about where dock's focus sits, so without remembering the
#    dismissal the next `view_data()` echo would put it straight back.
#
# The consequence of reading focus rather than clicks: re-selecting the block
# that was just cleared takes a click elsewhere and back, since focusing an
# already-focused panel is not a change and echoes nothing.
new_focus_tracker <- function(board, view_data) {

  selected  <- reactiveVal(NULL)
  dismissed <- reactiveVal(NULL)

  observe({

    pid <- focused_panel(view_data)

    if (is.null(pid) || !is_block_panel(pid)) {
      return()
    }

    id <- panel_obj_ids(pid)

    if (identical(id, isolate(dismissed()))) {
      return()
    }

    dismissed(NULL)

    if (!identical(id, isolate(selected()))) {
      selected(id)
    }
  })

  # A selected block that leaves the board is no selection at all -- and the
  # assistant itself can remove one, so this cannot be left to the user.
  observe({

    id <- selected()

    if (!is.null(id) && !id %in% board_block_ids(board$board)) {
      selected(NULL)
    }
  })

  list(
    get = selected,
    clear = function() {
      dismissed(isolate(selected()))
      selected(NULL)
      invisible()
    }
  )
}

# `focus` is a panel id, so it names an extension panel just as readily as a
# block one; only the latter is a selection.
is_block_panel <- function(x) {
  grepl("^block_panel-", x)
}

# The focused panel of the active view, as a panel id, or NULL when no dock has
# reported yet. Reactive: the caller's observer follows the user's clicks.
focused_panel <- function(view_data) {

  live <- if (is.function(view_data)) view_data() else NULL

  if (is.null(live)) {
    return(NULL)
  }

  active <- tryCatch(active_view(live[["views"]]), error = function(e) NULL)

  if (is.null(active)) {
    return(NULL)
  }

  live[["grids"]][[active]][["focus"]]
}

# The chip: which block the assistant will act on, and a way to say "not that
# one". Rendered from the same reactiveVal the prompt reads, so what the user
# sees and what the model is told cannot drift.
focus_chip <- function(id, board, ns) {

  if (is.null(id)) {
    return(NULL)
  }

  blk <- board_blocks(isolate(board$board))[[id]]

  if (is.null(blk)) {
    return(NULL)
  }

  div(
    class = "asst-focus",
    bsicons::bs_icon("bullseye"),
    span(class = "asst-focus-id", id),
    span(class = "asst-focus-type", block_name(blk)),
    actionLink(
      ns("focus_clear"),
      bsicons::bs_icon("x-lg"),
      class = "asst-focus-clear",
      title = "Clear the selection"
    )
  )
}

# The prompt's account of the selection. Deliberately soft: it says what an
# unqualified request means and what the selection does not cover, rather than
# fencing the tools off, because a user who asks a scoped question and then a
# board-wide one in the same breath should not have to clear a chip first.
describe_focus <- function(id, board) {

  if (is.null(id)) {
    return(NULL)
  }

  blks <- board_blocks(isolate(board$board))

  if (!id %in% names(blks)) {
    return(NULL)
  }

  paste0(
    "The user has block `", id, "` (", str_value(blks[[id]]),
    ") selected in the board UI, and can see that the assistant knows it.\n",
    "An instruction that names no block is about that one, so long as that ",
    "block can carry it out: \"change the filter to ...\", \"why is this ",
    "empty?\", \"drop that column\" all mean `", id, "`. Modify or inspect ",
    "it and leave the rest of the board alone -- in particular, do not add ",
    "blocks to satisfy a request the selected block can satisfy itself.\n",
    "The selection is context, not a fence, and never a reason to force a ",
    "request onto a block that cannot serve it. A request naming other ",
    "blocks, asking for something the board does not have yet, or asking ",
    "for what this block cannot do, is answered on its merits. Either way, ",
    "say which block you changed."
  )
}
