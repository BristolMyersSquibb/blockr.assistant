"""MCP facade for a live blockr board session.

Stateless Streamable HTTP MCP server. Every request names the board it targets
through the ``X-Blockr-Session`` header, carrying the connection string the
board's Agent panel shows -- the session URL plus the load balancer's routing
cookies, which are what land the call in the R process holding that board. A
bare URL works too where nothing needs pinning. ``BLOCKR_SESSION_URL`` sets a
default when one board is enough. Tools are read from that URL on every ``tools/list``, so the facade
holds no blockr knowledge and no state, which is what Posit Connect requires
of an MCP server it hosts.

Run locally:

    uvicorn server:app --host 0.0.0.0 --port 8765

Environment:
    BLOCKR_SESSION_URL  default session URL when the header is absent
    CONNECT_API_KEY     sent as ``Authorization: Key ...`` to the app (Connect)
"""

import base64
import binascii
import contextlib
import json
import os

import httpx
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

HEADER = "x-blockr-session"
REGISTRY = os.path.expanduser(
    os.environ.get("BLOCKR_AGENT_REGISTRY", "~/.blockr/agent-boards")
)
STALE_SECS = 120
BOARD_URI = "blockr://board"
GUIDE_URI = "blockr://guide"

FALLBACK_INSTRUCTIONS = (
    "Tools that read and change a live blockr board. Read the "
    f"`{GUIDE_URI}` resource before your first change: it carries how to work "
    "a board and the catalogue of skills this deployment authored, which you "
    "load with the `read_skill` tool."
)


def startup_instructions() -> str:
    """The board's own instructions, when one session is configured.

    MCP returns server instructions once, at initialize, so they can only be
    session-specific when the session is known at startup. With the session in
    a header instead, the client is pointed at the guide resource, which is
    read per request and is always the live board's.
    """
    raw = os.environ.get("BLOCKR_SESSION_URL")
    if not raw:
        return FALLBACK_INSTRUCTIONS
    try:
        url, cookie = decode_session(raw)
        r = httpx.get(url, headers=app_headers(cookie), timeout=30)
        r.raise_for_status()
        return r.json().get("instructions") or FALLBACK_INSTRUCTIONS
    except Exception:
        return FALLBACK_INSTRUCTIONS


def registry() -> list[dict]:
    """Boards that are currently announcing themselves.

    Nothing outside an app can enumerate its Shiny sessions, so each open board
    writes a small file here and refreshes it. An entry that has stopped being
    refreshed belonged to a process that died without cleaning up, and is
    dropped rather than offered.
    """
    import datetime
    import glob

    out = []
    now = datetime.datetime.now()
    for path in glob.glob(os.path.join(REGISTRY, "*.json")):
        try:
            with open(path) as fh:
                entry = json.load(fh)
            seen = datetime.datetime.strptime(entry["last_seen"], "%Y-%m-%dT%H:%M:%S")
        except (OSError, ValueError, KeyError):
            continue
        if (now - seen).total_seconds() < STALE_SECS:
            out.append(entry)
    return sorted(out, key=lambda e: e.get("last_seen", ""), reverse=True)


def session() -> tuple[str, str]:
    """Where the board is, and what pins the request to its process.

    The header carries the connection string the board's Agent panel shows:
    base64 of {"url", "cookie"}. A bare URL is accepted too, for a board
    served by a single process where there is nothing to pin.

    Connect load-balances an app over several R processes and a board lives in
    one of them, so without the routing cookie the calls scatter and only the
    ones that happen to land right are answered. The cookie is the load
    balancer's stickiness token (AWSALB behind an AWS ALB), not a
    credential: authentication is the API key, separately.
    """
    request = server.request_context.request
    raw = request.headers.get(HEADER) if request is not None else None
    raw = raw or os.environ.get("BLOCKR_SESSION_URL")
    if raw:
        return decode_session(raw)

    # Nothing was named, so ask the registry. One open board is the common
    # case and needs no choosing; several is a question for the caller rather
    # than a guess here, since picking the wrong one edits someone's work.
    boards = registry()
    if not boards:
        raise ValueError(
            "no board is open. Start one with the agent access extension "
            f"mounted, or name one in the {HEADER} header."
        )
    if len(boards) > 1:
        listed = ", ".join(f"{b['id']} ({b.get('board') or 'untitled'})" for b in boards)
        raise ValueError(
            f"{len(boards)} boards are open: {listed}. Call list_boards and "
            "pass the one you want as the `board` argument."
        )
    return boards[0]["url"], boards[0].get("cookie") or ""


def pick(board: str | None) -> tuple[str, str]:
    """The board a tool call names, or the only one open."""
    if not board:
        return session()
    for entry in registry():
        if board in (entry["id"], entry["session"], entry.get("board")):
            return entry["url"], entry.get("cookie") or ""
    raise ValueError(f"no open board matches '{board}'. Call list_boards.")


def decode_session(raw: str) -> tuple[str, str]:
    raw = raw.strip()
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw, ""
    try:
        payload = json.loads(base64.b64decode(raw, validate=True))
    except (ValueError, binascii.Error) as exc:
        raise ValueError(
            "X-Blockr-Session is neither a URL nor a connection string from "
            f"the Agent panel: {exc}"
        ) from exc
    url = payload.get("url")
    if not url:
        raise ValueError("connection string carries no url")
    return url, payload.get("cookie") or ""


def app_headers(cookie: str = "") -> dict:
    headers = {}
    key = os.environ.get("CONNECT_API_KEY")
    if key:
        headers["Authorization"] = f"Key {key}"
    if cookie:
        headers["Cookie"] = cookie
    return headers


server = Server("blockr", instructions=startup_instructions())


async def fetch_any_session() -> dict:
    """Like fetch_session, but never refuses over ambiguity.

    Any open board answers the question listing asks -- what are the tools and
    what do they take -- so the newest one will do. Which board a CALL acts on
    is a different question, and that one is still refused rather than guessed.
    """
    request = server.request_context.request
    raw = request.headers.get(HEADER) if request is not None else None
    raw = raw or os.environ.get("BLOCKR_SESSION_URL")
    if raw:
        url, cookie = decode_session(raw)
    else:
        boards = registry()
        if not boards:
            raise ValueError("no board is open")
        url, cookie = boards[0]["url"], boards[0].get("cookie") or ""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, headers=app_headers(cookie))
    r.raise_for_status()
    return r.json()


async def fetch_session() -> dict:
    url, cookie = session()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(url, headers=app_headers(cookie))
    r.raise_for_status()
    return r.json()


LIST_BOARDS = types.Tool(
    name="list_boards",
    description=(
        "The blockr boards currently open, newest first. Each has an `id` to "
        "pass as the `board` argument of any other tool. Call this first when "
        "more than one may be open, or when a call reports that it cannot tell "
        "which board you mean."
    ),
    inputSchema={"type": "object", "properties": {}, "required": []},
)


def with_board_arg(schema: dict) -> dict:
    """Let every tool name the board it acts on.

    The facade holds no state between calls, so the board cannot be selected
    once and remembered. Naming it per call is what keeps the server stateless,
    which is what Connect requires of one it hosts.
    """
    schema = dict(schema or {"type": "object", "properties": {}})
    props = dict(schema.get("properties") or {})
    props["board"] = {
        "type": "string",
        "description": (
            "Which board to act on, as `id` from list_boards. Omit when only "
            "one is open."
        ),
    }
    schema["properties"] = props
    return schema


@server.list_tools()
async def list_tools() -> list[types.Tool]:
    # Listing must never fail. The tool schemas come from a board, but which
    # board is a question the caller answers with list_boards -- and it cannot
    # call that if listing raised because it had not answered yet. So take the
    # most recent when nothing is named, and fall back to offering list_boards
    # alone when no board can be reached at all.
    try:
        data = await fetch_any_session()
    except Exception as exc:
        return [
            LIST_BOARDS,
            types.Tool(
                name="blockr_unavailable",
                description=(
                    "No blockr board could be reached, so its tools are not "
                    f"listed: {exc}. Open a board with the agent access "
                    "extension mounted, then call list_boards."
                ),
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),
        ]
    tools = [
        types.Tool(
            name=t["name"],
            description=t.get("description") or "",
            inputSchema=with_board_arg(t.get("inputSchema")),
        )
        for t in data["tools"]
    ]
    return [LIST_BOARDS] + tools


@server.call_tool()
async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    arguments = dict(arguments or {})
    board = arguments.pop("board", None)

    if name == "list_boards":
        entries = registry()
        if not entries:
            return [types.TextContent(type="text", text="No blockr board is open.")]
        lines = [
            f"{e['id']}  {e.get('board') or 'untitled'}"
            + (f"  ({e['user']})" if e.get("user") else "")
            + f"  opened {e['opened_at']}"
            for e in entries
        ]
        return [types.TextContent(type="text", text="\n".join(lines))]

    url, cookie = pick(board)
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            url,
            json={"name": name, "arguments": arguments},
            headers=app_headers(cookie),
        )
    if r.status_code >= 400:
        raise ValueError(f"board session answered {r.status_code}: {r.text}")
    data = r.json()
    text = "\n".join(item.get("text", "") for item in data.get("content", []))
    if data.get("isError"):
        raise ValueError(text)
    return [types.TextContent(type="text", text=text)]


@server.list_resources()
async def list_resources() -> list[types.Resource]:
    return [
        types.Resource(
            uri=GUIDE_URI,
            name="guide",
            description=(
                "How to work this board, plus the catalogue of skills this "
                "deployment authored. Read it before changing anything."
            ),
            mimeType="text/markdown",
        ),
        types.Resource(
            uri=BOARD_URI,
            name="board",
            description="The board's blocks, links, views and options, as they stand.",
            mimeType="text/plain",
        ),
    ]


@server.read_resource()
async def read_resource(uri) -> str:
    data = await fetch_session()
    if str(uri) == BOARD_URI:
        return data.get("board") or ""
    if str(uri) == GUIDE_URI:
        return data.get("instructions") or ""
    raise ValueError(f"unknown resource {uri}")


# The guide is also a prompt, because a client that ignores server
# instructions still lists prompts, and a user can invoke it by name.
@server.list_prompts()
async def list_prompts() -> list[types.Prompt]:
    return [
        types.Prompt(
            name="blockr-guide",
            description=(
                "How to work this board, and the skills available on it."
            ),
        )
    ]


@server.get_prompt()
async def get_prompt(name: str, arguments: dict | None) -> types.GetPromptResult:
    if name != "blockr-guide":
        raise ValueError(f"unknown prompt {name}")
    data = await fetch_session()
    return types.GetPromptResult(
        description="blockr board guide",
        messages=[
            types.PromptMessage(
                role="user",
                content=types.TextContent(
                    type="text", text=data.get("instructions") or ""
                ),
            )
        ],
    )


session_manager = StreamableHTTPSessionManager(
    app=server,
    event_store=None,
    json_response=True,
    stateless=True,
    security_settings=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


class MCPEndpoint:
    """ASGI app for the MCP path. A class, not a function, so Starlette mounts it
    as-is on the exact path and no client is redirected from /mcp to /mcp/."""

    async def __call__(self, scope, receive, send):
        await session_manager.handle_request(scope, receive, send)


async def health(request):
    return JSONResponse({"ok": True, "mcp": "/mcp", "header": "X-Blockr-Session"})


@contextlib.asynccontextmanager
async def lifespan(app):
    async with session_manager.run():
        yield


app = Starlette(
    routes=[Route("/", health), Route("/mcp", MCPEndpoint(), methods=["GET", "POST", "DELETE"])],
    lifespan=lifespan,
)
