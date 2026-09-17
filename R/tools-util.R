with_tool_errors <- function(name, expr) {

  tryCatch(
    expr,
    error = function(e) {

      msg <- conditionMessage(e)
      pat <- glue::glue("^{name}\\([^)]*\\) failed:")

      out <- if (grepl(pat, msg)) {
        msg
      } else {
        glue::glue("{name} failed: {msg}")
      }

      # Once per failure, not once per wrapper: a tool that re-throws an
      # inner failure carries its message, note and all.
      if (grepl(tool_failure_note(), out, fixed = TRUE)) {
        out
      } else {
        paste0(out, "\n\n", tool_failure_note())
      }
    }
  )
}

# What a failed call MEANS for the turn, appended to every tool error.
#
# A condition message describes R, not the turn: "undefined columns selected"
# is a true statement about `[` and says nothing about whether the block was
# read. Measured on gpt-5.4 (_scratch/clinical-asks/error-channel/probe.R,
# 6 runs an arm, the prod shape: edit a table, commit, the readback fails):
# with the bare message the model told the user the table was updated and
# checked in 5 of 6 runs; with this note appended it said it could not confirm
# in 6 of 6. Marking the result as an error through ellmer instead -- which is
# what `stop()` here would do -- moved it only to 2 of 6, so the sentence is
# the part that works, not the flag.
#
# Kept generic because this wraps every tool: a read that failed read nothing,
# a staging call that failed staged nothing.
tool_failure_note <- function() {
  paste(
    "This call did not run: it returned nothing and changed nothing.",
    "Nothing about the board follows from it -- in particular, a read that",
    "failed is not evidence that what you were reading is fine, and it does",
    "not verify anything you built. Correct the call and try again, or tell",
    "the user plainly what you could not do."
  )
}

parse_args_json <- function(s, tool) {

  if (!nzchar(s)) {
    return(list())
  }

  # simplifyVector keeps scalar arrays atomic (by: ["x"] -> "x"), but
  # array-of-objects arguments (filter `conditions`, summarize `summaries`) must
  # stay lists of named records: simplifyDataFrame would collapse them into a
  # data.frame the blocks' state cannot consume -- silently empty, or a
  # $-on-atomic crash on the flat-argument blocks.
  parsed <- jsonlite::fromJSON(
    s,
    simplifyVector = TRUE,
    simplifyDataFrame = FALSE,
    simplifyMatrix = FALSE
  )

  if (is.null(parsed)) {
    return(list())
  }

  if (!is.list(parsed) ||
        (length(parsed) > 0L && is.null(names(parsed)))) {
    stop(
      glue::glue(
        "{tool} `args` must be a JSON object with named fields, e.g. ",
        "'{{\"n\": 10}}'. Got a JSON ",
        "{if (is.list(parsed)) 'array' else 'scalar or array'}."
      ),
      call. = FALSE
    )
  }

  parsed
}

compact <- function(x) {
  x[!vapply(x, is.null, logical(1L))]
}

nullify <- function(x) {

  if (length(x) == 0L) {
    return(NULL)
  }

  if (is.atomic(x) && length(x) == 1L && is.na(x)) {
    return(NULL)
  }

  x
}
