#!/bin/sh
# Start the HanX MCP server from whichever HanX install is on this computer.
# Desktop apps launch plugins with a minimal PATH, so check the usual install locations explicitly.

PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

for candidate in \
    "${HANX_PATH:-}" \
    /Applications/HanX.app/Contents/Resources/CLI/hanx \
    "$HOME/Applications/HanX.app/Contents/Resources/CLI/hanx" \
    "$(command -v hanx 2>/dev/null)"
do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
        exec "$candidate" mcp
    fi
done

printf '%s\n' 'HanX is not installed. Install it from https://hanx.io/ (npm, Homebrew or the app), then start a new chat.' >&2
exit 127
