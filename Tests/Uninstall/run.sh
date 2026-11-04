#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
swiftc "$root/Sources/AgentCLI/AgentUninstall.swift" "$root/Tests/Uninstall/main.swift" -o "$temporary/uninstall-test"
"$temporary/uninstall-test"
