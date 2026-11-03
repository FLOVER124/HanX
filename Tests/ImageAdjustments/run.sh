#!/bin/zsh
set -e
cd "${0:A:h}/../.."
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/hanx-image-adjustments.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT
swiftc -Onone Sources/Core/ImageAdjustments.swift Tests/ImageAdjustments/main.swift -o "$TASK_BUILD/tests"
"$TASK_BUILD/tests"
