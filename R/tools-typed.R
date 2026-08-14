block_tool_name <- function(kind, type) {
  paste0(kind, "_", type)
}

generic_tool_name <- function(kind) {
  paste0(kind, "_block")
}

pool_key <- function(kind, type) {
  paste0(kind, ":", type)
}

modifiable_args <- function(type) {

  blk <- tryCatch(create_block(type), error = function(e) NULL)

  if (is.null(blk)) {
    return(character())
  }

  setdiff(
    intersect(names(block_meta_arguments(type)), external_ctrl_vars(blk)),
    "block_name"
  )
}

# A registry type descriptor is a plain JSON-Schema-subset list, so it round
# trips through JSON into ellmer's type system. Every argument is marked
# optional: an omitted one falls back to the constructor's default, which is
# what passing a subset of keys to add_block already does, and no package
# declares a top-level `required` either way.
as_tool_type <- function(x) {

  res <- ellmer::type_from_schema(
    text = jsonlite::toJSON(x, auto_unbox = TRUE)
  )

  res@required <- FALSE

  res
}

arg_tool_types <- function(args) {

  types <- lapply(args, arg_spec_type)

  if (any(lgl_ply(types, is.null))) {
    return(NULL)
  }

  set_names(lapply(types, as_tool_type), names(args))
}

block_name_type <- function() {
  ellmer::type_string(
    "Display name for the block.",
    required = FALSE
  )
}

add_tool_types <- function(type) {

  props <- arg_tool_types(block_meta_arguments(type))

  if (is.null(props)) {
    return(NULL)
  }

  c(
    props,
    list(
      block_name = block_name_type(),
      id = ellmer::type_string(
        "Optional id for the new block. Generated if omitted.",
        required = FALSE
      )
    )
  )
}

modify_tool_types <- function(type) {

  ctrl <- modifiable_args(type)

  if (!length(ctrl)) {
    return(NULL)
  }

  props <- arg_tool_types(block_meta_arguments(type)[ctrl])

  if (is.null(props)) {
    return(NULL)
  }

  c(
    list(id = ellmer::type_string("Id of the block to modify.")),
    props,
    list(block_name = block_name_type())
  )
}

block_tool_types <- function(kind, type) {

  switch(
    kind,
    add = add_tool_types(type),
    modify = modify_tool_types(type),
    stop("Unknown tool kind: ", kind)
  )
}

# A tool's argument names are validated against its function's formals, so the
# closure is built to match the derived schema. Every formal defaults to NULL
# and the supplied ones are collected back into the named list the handler
# works with.
block_tool_fun <- function(arg_names, handler) {

  fun <- function() {
    handler(compact(mget(names(formals(sys.function())))))
  }

  formals(fun) <- set_names(rep(list(NULL), length(arg_names)), arg_names)

  fun
}

block_type_blurb <- function(type) {

  meta <- block_metadata(type)

  paste(
    c(
      meta[["description"]],
      meta[["guidance"]][[1L]]
    ),
    collapse = " "
  )
}

add_tool_description <- function(type) {

  meta <- block_metadata(type)

  paste(
    sprintf(
      "Add a %s to the board, with typed constructor arguments.",
      meta[["name"]]
    ),
    block_type_blurb(type),
    "An omitted argument takes the constructor's default. Prefer this",
    "over add_block for this block type."
  )
}

modify_tool_description <- function(type) {

  meta <- block_metadata(type)

  paste(
    sprintf(
      "Change the externally controllable arguments of a %s already on",
      meta[["name"]]
    ),
    "the board. Only supplied arguments change; the rest keep their",
    "current values. Prefer this over modify_block for this block type."
  )
}

add_tool_handler <- function(type, board, pending, session, note) {

  name <- block_tool_name("add", type)

  function(args) {
    with_tool_errors(name, {

      id <- args[["id"]]
      args[["id"]] <- NULL

      res <- stage_added_block(board, pending, id, type, args)

      note("add", type)

      res
    })
  }
}

modify_tool_handler <- function(type, board, pending, session, note) {

  name <- block_tool_name("modify", type)

  function(args) {
    with_tool_errors(name, {

      id <- args[["id"]]
      args[["id"]] <- NULL

      if (is.null(id) || !nzchar(id)) {
        stop("no block id supplied", call. = FALSE)
      }

      res <- stage_modified_block(board, pending, id, args)

      note("modify", type)

      res
    })
  }
}

block_tool <- function(kind, type, board, pending, session, note) {

  props <- block_tool_types(kind, type)

  if (is.null(props)) {
    return(NULL)
  }

  handler <- switch(
    kind,
    add = add_tool_handler(type, board, pending, session, note),
    modify = modify_tool_handler(type, board, pending, session, note)
  )

  description <- switch(
    kind,
    add = add_tool_description(type),
    modify = modify_tool_description(type)
  )

  ellmer::tool(
    block_tool_fun(names(props), handler),
    name        = block_tool_name(kind, type),
    description = description,
    arguments   = props
  )
}

armed_note <- function(kind, type) {
  sprintf(
    paste(
      "The typed `%s` tool is now registered for this block type -- call",
      "it rather than %s."
    ),
    block_tool_name(kind, type),
    generic_tool_name(kind)
  )
}

untyped_note <- function(kind, type) {

  if (identical(kind, "modify") && !length(modifiable_args(type))) {
    return(
      paste(
        "This block type declares no externally controllable arguments,",
        "so only `block_name` can be changed -- via modify_block."
      )
    )
  }

  sprintf(
    paste(
      "No typed tool is available for this block type: not every argument",
      "declares a type. Call %s with JSON arguments instead."
    ),
    generic_tool_name(kind)
  )
}

pool_full_note <- function(kind, entries) {
  sprintf(
    paste(
      "The typed-tool pool is full -- %s were armed this turn and are",
      "still callable. Call %s for this block type, or commit what you",
      "have and describe it again on the next turn."
    ),
    paste(chr_xtr(entries, "type"), collapse = ", "),
    generic_tool_name(kind)
  )
}

lru_victim <- function(entries, turn) {

  stale <- entries[int_xtr(entries, "turn") != turn]

  if (!length(stale)) {
    return(NULL)
  }

  names(stale)[[which.min(int_xtr(stale, "seq"))]]
}

# Typed per-type tools are materialized on demand and held in two pools, one
# per kind, each capped independently. The state lives in an environment
# rather than closure variables so the counter updates read as ordinary
# assignment (lintr's assignment_linter rejects a closure-local `<<-`).
new_block_tool_pool <- function(client, board, pending, session) {

  state <- new.env(parent = emptyenv())

  state$entries <- list()
  state$counter <- 0L
  state$turn    <- 0L

  touch <- function(key) {

    state$counter <- state$counter + 1L

    state$entries[[key]][["seq"]]  <- state$counter
    state$entries[[key]][["turn"]] <- state$turn

    invisible()
  }

  note <- function(kind, type) {

    key <- pool_key(kind, type)

    if (key %in% names(state$entries)) {
      touch(key)
    }

    invisible()
  }

  evict <- function(key) {

    entry <- state$entries[[key]]
    tools <- client$get_tools()

    client$set_tools(
      tools[
        setdiff(
          names(tools),
          block_tool_name(entry[["kind"]], entry[["type"]])
        )
      ]
    )

    state$entries[[key]] <- NULL

    invisible()
  }

  arm <- function(kind, type) {

    key <- pool_key(kind, type)

    if (key %in% names(state$entries)) {
      touch(key)
      return(armed_note(kind, type))
    }

    tool <- block_tool(kind, type, board, pending, session, note)

    if (is.null(tool)) {
      return(untyped_note(kind, type))
    }

    siblings <- state$entries[
      chr_xtr(state$entries, "kind") == kind
    ]

    if (length(siblings) >= block_tool_pool_size()) {

      victim <- lru_victim(siblings, state$turn)

      if (is.null(victim)) {
        return(pool_full_note(kind, siblings))
      }

      evict(victim)
    }

    client$register_tool(tool)

    state$counter <- state$counter + 1L
    state$entries[[key]] <- list(
      kind = kind,
      type = type,
      seq  = state$counter,
      turn = state$turn
    )

    armed_note(kind, type)
  }

  list(
    arm = arm,
    note = note,
    new_turn = function() {
      state$turn <- state$turn + 1L
      invisible()
    },
    armed = function() names(state$entries)
  )
}

arm_block_tool <- function(pool, kind, type) {

  if (is.null(pool) || !length(type)) {
    return(NULL)
  }

  pool$arm(kind, type)
}
