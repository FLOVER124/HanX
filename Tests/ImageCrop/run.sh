#!/bin/zsh
set -e
cd "${0:A:h}/../.."
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/hanx-image-crop.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT
SRC=(Sources/Core/*.swift Sources/Formats/*.swift Sources/Sheet/*.swift Sources/Sheet/Functions/*.swift Sources/Slides/*.swift Sources/Bridge/*.swift Sources/App/*.swift)
SRC=("${(@)SRC:#Sources/App/main.swift}")
swiftc -Onone -module-name HanXCropTests -o "$TASK_BUILD/image-crop-tests" "${SRC[@]}" Tests/ImageCrop/main.swift
"$TASK_BUILD/image-crop-tests"
