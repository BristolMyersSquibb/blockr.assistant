#' The cookies that pin a request to the process holding a board
#'
#' A server that runs an app as several R processes puts something in front to
#' spread the load, and a board lives in exactly one of those processes. A
#' browser keeps landing in the right one because that something sets a
#' stickiness cookie; a plain HTTP client does not, so its calls scatter and
#' only the ones that happen to land right are answered.
#'
#' Replaying the stickiness cookie fixes it. Which cookie that is depends on
#' what sits in front, so this is a list and not a constant:
#'
#' * **AWS** load balancers set fixed names, `AWSALB` and `AWSALBCORS` on an
#'   Application Load Balancer, `AWSELB` on a Classic one.
#' * **Azure** Application Gateway sets `ApplicationGatewayAffinity` and
#'   `ApplicationGatewayAffinityCORS`.
#' * **nginx, HAProxy and Traefik** let the operator choose the name, so none
#'   can be defaulted. Set the option.
#'
#' The default covers the vendors that fix their names. Where it is wrong the
#' symptom is distinctive: some calls answer and others come back as the app's
#' own "not found" from a sibling process. The board's panel lists the cookies
#' the browser actually sent, which is where to look for the right name.
#'
#' Only the cookies named here travel. That is the point of a list rather than
#' forwarding the header: a stickiness cookie is a routing token with no
#' identity in it, while the rest of a browser's `Cookie` header is the user's
#' session with the server, and a string an agent keeps in a config file should
#' carry the first and never the second.
#'
#' Set `blockr.agent_affinity_cookies` to override.
#'
#' @return Character vector of cookie names.
#' @export
agent_affinity_cookies <- function() {
  getOption(
    "blockr.agent_affinity_cookies",
    c(
      "AWSALB", "AWSALBCORS",                                   # AWS ALB
      "AWSELB",                                                 # AWS Classic
      "ApplicationGatewayAffinity", "ApplicationGatewayAffinityCORS"  # Azure
    )
  )
}

# Pick the routing cookies out of a request's Cookie header, dropping
# everything else unread.
affinity_cookie <- function(session, names = agent_affinity_cookies()) {

  raw <- session$request$HTTP_COOKIE

  if (is.null(raw) || !nzchar(raw)) {
    return("")
  }

  parts <- trimws(strsplit(raw, ";", fixed = TRUE)[[1]])
  parts <- parts[nzchar(parts)]
  keys  <- vapply(strsplit(parts, "=", fixed = TRUE), `[`, "", 1L)

  paste(parts[keys %in% names], collapse = "; ")
}

#' One string that addresses this board
#'
#' An agent needs two things to reach a board: the session's URL, and the
#' routing cookies that land the request in the process holding it. Publishing
#' them as one token means the user copies once and cannot copy half of it.
#'
#' The token is base64 of a small JSON object. It is not encryption and is not
#' meant to be: it carries no credential, only an address and a load-balancer
#' routing hint, and the endpoint it names still demands whatever
#' authentication the deployment demands.
#'
#' @param url The session's tool endpoint URL.
#' @param cookie Routing cookies, as returned by `affinity_cookie()`.
#' @return A single base64 string.
#' @noRd
connection_token <- function(url, cookie = "") {
  # base64_enc wraps at 72 characters, and a newline in an HTTP header value
  # is a protocol error -- the client refuses to send it, long before anything
  # reaches the board.
  gsub("[\r\n]", "", jsonlite::base64_enc(
    jsonlite::toJSON(list(url = url, cookie = cookie), auto_unbox = TRUE)
  ))
}
