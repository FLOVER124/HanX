#!/bin/zsh
set -e
cd "${0:A:h}/../.."
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/hanx-image-adjustments-integration.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT
SRC=(Sources/Core/*.swift Sources/Formats/*.swift Sources/Sheet/*.swift Sources/Sheet/Functions/*.swift Sources/Slides/*.swift Sources/Bridge/*.swift Sources/App/*.swift)
SRC=("${(@)SRC:#Sources/App/main.swift}")
swiftc -Onone -module-name HanXAdjustmentTests -o "$TASK_BUILD/image-adjustments-integration-tests" "${SRC[@]}" Tests/ImageAdjustmentsIntegration/main.swift
"$TASK_BUILD/image-adjustments-integration-tests"
