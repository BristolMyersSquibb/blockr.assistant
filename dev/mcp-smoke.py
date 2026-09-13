"""Drive a live board through the facade as an MCP client would.

    python3 dev/mcp-smoke.py http://127.0.0.1:8765/mcp <session tools URL>
"""

import asyncio
import json
import sys, time
BLOCK_ID = f"smoke{int(time.time()) % 100000}"

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


def text(res):
    return "\n".join(c.text for c in res.content if getattr(c, "text", None))


async def main(mcp_url, session_url):
    headers = {"X-Blockr-Session": session_url}
    async with streamablehttp_client(mcp_url, headers=headers) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = await s.list_tools()
            print(f"{len(tools.tools)} tools:", ", ".join(t.name for t in tools.tools))

            print("\n== list_blocks")
            print(text(await s.call_tool("list_blocks", {})))

            print("\n== add_block(filter_block)")
            print(text(await s.call_tool(
                "add_block",
                {"type": "filter_block", "id": BLOCK_ID,
                 "args": json.dumps({"conditions": [
                     {"type": "numeric", "column": "Sepal.Length", "op": ">", "value": 6}
                 ]})},
            )))

            print("\n== add_link(data -> flt)")
            print(text(await s.call_tool(
                "add_link", {"from": "data", "to": BLOCK_ID, "input": "data"}
            )))

            print("\n== commit")
            print(text(await s.call_tool("commit", {})))

            print("\n== get_block_result(flt)")
            print(text(await s.call_tool("get_block_result", {"id": BLOCK_ID})))

            print("\n== resource blockr://board")
            res = await s.read_resource("blockr://board")
            print(res.contents[0].text)


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:3]))
