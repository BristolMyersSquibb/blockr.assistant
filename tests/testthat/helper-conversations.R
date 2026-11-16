# A conversation of one message that the user sent, in the shape that the
# schema of the assistant's state gives.
conversation <- function(title = "Sales by region") {
  list(
    title = title,
    updated = "2026-11-16T08:00:00Z",
    messages = list(
      list(
        id = "m1",
        role = "user",
        parts = list(list(type = "text", text = "Sum the sales by region.")),
        created = "2026-11-16T08:00:00Z"
      )
    ),
    usage = list(input = 0, output = 0, last = 0),
    model = NULL
  )
}
