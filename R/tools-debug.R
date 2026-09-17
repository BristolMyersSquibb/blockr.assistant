# Run a block's code without the block.
#
# A block whose script fails leaves the model with a one-line condition and no
# way to narrow it: the only loop available was modify -> commit ->
# get_block_conditions, three round trips that mutate the board and report the
# same sentence each time. On prod (2026-09-17) a composer table died with
# `incorrect number of arguments to "<-"` and the assistant went round that
# loop three times and gave up. The script was valid R; the malformed call was
# produced by the block's own rewriting of it, so no edit could have helped and
# nothing available said which statement failed.
#
# This evaluates statements one at a time, off the board, and names the one
# that raised. It runs what the BLOCK runs -- `server$expr()`, the language
# blockr.core evaluates, after the block has substituted its control values --
# not the script text, because that is where the failure can live.

# The board links feeding a block, as `input name -> upstream id`. An unnamed
# input is the block's `data`.
block_input_ids <- function(id, board) {

  lnks <- tryCatch(
    as.data.frame(board_links(isolate(board$board))),
    error = function(e) NULL
  )

  if (!is.data.frame(lnks) || !nrow(lnks)) {
    return(character())
  }

  lnks <- lnks[lnks[["to"]] == id, , drop = FALSE]

  if (!nrow(lnks)) {
    return(character())
  }

  nms <- lnks[["input"]]
  nms[is.na(nms) | !nzchar(nms)] <- "data"

  set_names(lnks[["from"]], nms)
}

# What each input holds, plus the ones that hold nothing and why. The names
# are the block's input names, which is how blockr.core hands them over.
block_input_data <- function(id, board) {

  ids <- block_input_ids(id, board)
  dat <- list()
  missing <- character()

  for (nm in names(ids)) {

    up <- ids[[nm]]
    status <- eval_status(up, board)

    if (has_no_result(status)) {
      missing <- c(missing, set_names(paste0(up, " (", status, ")"), nm))
      next
    }

    val <- tryCatch(isolate(board$blocks[[up]]$server$result()),
                    error = function(e) e)

    if (inherits(val, "error")) {
      missing <- c(
        missing, set_names(paste0(up, " (", conditionMessage(val), ")"), nm)
      )
      next
    }

    dat[[nm]] <- val
  }

  list(data = dat, bound = ids, missing = missing)
}

# blockr.core's own eval_impl(), which is what makes this the block's run and
# not an imitation of it: a bquoted block carries `.(data)` placeholders that
# are resolved against the INPUT NAMES, and the expression is evaluated in
# eval_env(), whose parent depends on a board option. Diverging from either
# would make a block that works look broken here, or the reverse.
block_eval_lang <- function(blk, lang, dat) {

  # Applied unconditionally. blockr.core branches on the block's expr type,
  # which is internal to it; the substitution is a no-op on an expression
  # holding no `.()` placeholders, which is exactly what a quoted block's is.
  do.call(
    bquote,
    list(
      lang,
      lapply(set_names(nm = names(dat)), as.name),
      splice = is.na(blockr.core::block_arity(blk))
    )
  )
}

# Top-level statements of a language object, so a failure can be attributed to
# one of them rather than to the whole block.
lang_statements <- function(lang) {

  if (is.call(lang) && identical(lang[[1L]], quote(`{`))) {
    return(as.list(lang)[-1L])
  }

  list(lang)
}

# One line saying what a statement produced, in the terms a next statement
# would need: a frame's shape, anything else's class.
value_line <- function(x) {

  if (is.data.frame(x)) {
    return(paste0("data frame, ", nrow(x), " x ", ncol(x)))
  }

  if (is.null(x)) {
    return("NULL")
  }

  paste0("<", paste(class(x), collapse = "/"), ">")
}

# Evaluate statements in order, stopping at the first that raises. Pure, so it
# is testable without a board.
run_statements <- function(stmts, env) {

  lines <- character()

  for (i in seq_along(stmts)) {

    txt <- paste(deparse(stmts[[i]]), collapse = " ")
    out <- tryCatch(
      list(value = withVisible(eval(stmts[[i]], env))$value),
      error = function(e) list(error = conditionMessage(e))
    )

    if (!is.null(out$error)) {
      return(
        list(
          ok = FALSE, at = i, lines = lines,
          message = paste0(
            "Statement ", i, " of ", length(stmts), " raised.\n",
            "  ", txt, "\n",
            "  Error: ", out$error
          )
        )
      )
    }

    lines <- c(lines, paste0("  ", i, ". ", txt, "  -> ", value_line(out$value)))
  }

  list(ok = TRUE, at = NA_integer_, lines = lines, value = out$value)
}

tool_run_block_script <- function(board, update, session) {

  ellmer::tool(
    function(id, code = NULL) {
      with_tool_errors("run_block_script", {

        blks <- isolate(board$blocks)

        if (!id %in% names(blks)) {
          return(glue::glue("No block with id {id}. Call list_blocks first."))
        }

        ins <- block_input_data(id, board)
        own <- is.null(code) || !nzchar(code)

        lang <- if (own) {
          tryCatch(
            block_eval_lang(
              blks[[id]]$block, isolate(blks[[id]]$server$expr()), ins$data
            ),
            error = function(e) e
          )
        } else {
          tryCatch(
            exprs_to_lang_safe(parse(text = code)), error = function(e) e
          )
        }

        if (inherits(lang, "error")) {
          return(
            paste0(
              "Could not read the code to run: ", conditionMessage(lang)
            )
          )
        }

        stmts <- lang_statements(lang)
        res <- run_statements(stmts, blockr.core::eval_env(ins$data))

        head_lines <- c(
          if (length(ins$bound)) paste0(
            "Inputs bound: ",
            paste(paste0(names(ins$bound), " = ", ins$bound), collapse = ", ")
          ),
          if (length(ins$missing)) paste0(
            "NOT bound (the upstream holds no result): ",
            paste(paste0(names(ins$missing), " <- ", ins$missing),
                  collapse = ", ")
          ),
          if (own) paste(
            "Running the expression the block itself runs, with its current",
            "control values substituted. That is not always the script you",
            "wrote: if a statement below fails on code that looks correct,",
            "the block's rewriting of the script is the suspect, not your",
            "text, and editing the script again will not change it."
          )
        )

        if (res$ok) {
          return(paste(c(
            head_lines, "",
            "Ran to the end.", res$lines, "",
            paste("Value:", value_line(res$value)),
            "Nothing was staged and the board was not touched."
          ), collapse = "\n"))
        }

        paste(c(
          head_lines, "",
          if (length(res$lines)) c("Ran:", res$lines, ""),
          res$message, "",
          "Nothing was staged and the board was not touched."
        ), collapse = "\n")
      })
    },
    name        = "run_block_script",
    description = paste(
      "Run a block's code OFF the board and see what each statement does.",
      "Evaluates the block's statements one at a time against its real",
      "inputs (each upstream block's result, bound under the input's name --",
      "usually `data`), reporting what every statement produced and, if one",
      "raises, which one and its text.",
      "Two cases, both before you edit and commit again:",
      "a block that ERRORS -- a commit tells you only that it still fails,",
      "this tells you where; and a block that RAN BUT PRODUCED THE WRONG",
      "THING -- the readback does not show what was asked, nothing raised,",
      "and the statement values say where the rows went.",
      "Pass `code` to run a candidate against the same inputs and see its",
      "result before you stage anything. That is the loop: change the code",
      "here until the value is right, then modify the block once. Committing",
      "to find out what a change does is the slow way round and it mutates",
      "the board each time.",
      "Read-only: nothing is staged and no block is modified."
    ),
    arguments = list(
      id = ellmer::type_string("Block id, as returned by list_blocks."),
      code = ellmer::type_string(
        paste(
          "Optional R code to run instead of the block's own, against the",
          "same inputs. For trying a fix before you stage it."
        ),
        required = FALSE
      )
    )
  )
}

# parse() gives an expression vector; the board works in one language object.
exprs_to_lang_safe <- function(exprs) {

  if (length(exprs) == 1L) {
    return(exprs[[1L]])
  }

  as.call(c(list(quote(`{`)), as.list(exprs)))
}
