"""Internal HTTP bridge between the HanX cloud Worker and the local `hanx mcp` engine.

The Worker is the only client. Each request gets a fresh temporary directory and a
fresh `hanx mcp` process, so files from different users never share state.

POST /call
  {"tool": "read", "arguments": {...},
   "input": {"name": "a.hwp", "data": "<base64>"},   # optional
   "output": {"name": "b.docx"}}                     # optional
  -> {"result": <MCP tools/call result>, "output": {"name", "data"} | null}
GET /health -> {"ok": true}
"""

import base64
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HANX = os.environ.get("HANX_BIN", "/opt/hanx/hanx")
PORT = int(os.environ.get("PORT", "8080"))
TIMEOUT = int(os.environ.get("HANX_TIMEOUT", "90"))
MAX_BODY = int(os.environ.get("HANX_MAX_BODY", str(48 * 1024 * 1024)))

# Engine tools the cloud service may call. PDF editing needs extra native tools and
# is intentionally not exposed remotely.
ALLOWED = {
    "capabilities", "read", "create", "edit", "convert",
    "sheet_read", "sheet_eval", "sheet_recalculate", "sheet_functions",
    "xml_read", "xml_edit", "package_list", "package_read", "package_patch",
}
# Keys whose values would let a caller read files from the container itself.
PATH_KEYS = {"path", "imagePath", "image", "font", "baseDirectory", "guidePath"}


class BadRequest(Exception):
    pass


def safe_name(name, fallback):
    name = unicodedata.normalize("NFC", str(name or "")).replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f<>:\"|?*]", "_", name).strip(" .")
    return name[:180] or fallback


def reject_paths(value, where="arguments"):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in PATH_KEYS and isinstance(item, str):
                raise BadRequest(f"Local file paths are not available on the cloud service ({where}.{key}). Embed images as base64 data instead.")
            reject_paths(item, f"{where}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            reject_paths(item, f"{where}[{index}]")


def run_tool(tool, arguments, workdir):
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "hanx-cloud", "version": "1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "hanx_" + tool, "arguments": arguments}},
    ]
    stdin = "".join(json.dumps(m, ensure_ascii=False) + "\n" for m in messages)
    env = {"PATH": "/usr/bin:/bin", "HOME": str(workdir), "LANG": "C.UTF-8", "TMPDIR": str(workdir)}
    proc = subprocess.run([HANX, "mcp"], input=stdin, capture_output=True, text=True, cwd=workdir, env=env, timeout=TIMEOUT)
    for line in proc.stdout.splitlines():
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if message.get("id") == 2:
            if "error" in message:
                return {"content": [{"type": "text", "text": json.dumps({"ok": False, "error": {"code": "invalid_argument", "message": message["error"].get("message", "Invalid request")}}, ensure_ascii=False)}], "isError": True}
            return message["result"]
    raise RuntimeError("HanX engine returned no result: " + proc.stderr[-500:])


def handle_call(body):
    tool = body.get("tool")
    if tool not in ALLOWED:
        raise BadRequest("Unknown tool")
    arguments = body.get("arguments") or {}
    if not isinstance(arguments, dict):
        raise BadRequest("arguments must be an object")
    reject_paths(arguments)
    work = pathlib.Path(tempfile.mkdtemp(prefix="hanx-"))
    try:
        (work / "in").mkdir()
        (work / "out").mkdir()
        if body.get("input"):
            source = work / "in" / safe_name(body["input"].get("name"), "input")
            source.write_bytes(base64.b64decode(body["input"]["data"], validate=True))
            arguments["input"] = str(source)
        target = None
        if body.get("output"):
            target = work / "out" / safe_name(body["output"].get("name"), "output")
            arguments["output"] = str(target)
        if tool in ("create", "edit"):
            arguments["baseDirectory"] = str(work / "in")
        result = run_tool(tool, arguments, work)
        # Container paths mean nothing to remote callers.
        prefixes = [str(work / "out") + "/", str(work / "in") + "/", str(work)]
        for item in result.get("content", []):
            if item.get("type") == "text":
                for prefix in prefixes:
                    # HanX escapes "/" as "\/" in its JSON output.
                    item["text"] = item["text"].replace(prefix.replace("/", "\\/"), "").replace(prefix, "")
        output = None
        if target is not None and not result.get("isError") and target.is_file():
            output = {"name": target.name, "data": base64.b64encode(target.read_bytes()).decode()}
        return {"result": result, "output": output}
    finally:
        shutil.rmtree(work, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "hanx-engine"

    def reply(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/call":
            return self.reply(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.reply(413, {"error": "request too large"})
        try:
            body = json.loads(self.rfile.read(length))
            self.reply(200, handle_call(body))
        except BadRequest as error:
            self.reply(400, {"error": str(error)})
        except subprocess.TimeoutExpired:
            self.reply(504, {"error": f"HanX engine timed out after {TIMEOUT}s"})
        except (ValueError, KeyError, TypeError) as error:
            self.reply(400, {"error": f"invalid request: {error}"})
        except Exception as error:  # noqa: BLE001 - report engine failures to the Worker
            self.reply(500, {"error": str(error)})

    def log_message(self, fmt, *args):
        # Keep logs free of document names and contents.
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
