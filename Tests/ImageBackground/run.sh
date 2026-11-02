#!/bin/zsh
set -e
cd "${0:A:h}/../.."
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/hanx-image-background.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT
swiftc -Onone -o "$TASK_BUILD/image-background-tests" Sources/App/SolidBackgroundRemoval.swift Tests/ImageBackground/main.swift
"$TASK_BUILD/image-background-tests"
