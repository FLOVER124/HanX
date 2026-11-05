#!/bin/zsh
# Fast debug build (host arch, -Onone) into build/Dev.app for local testing.
set -e
cd "$(dirname "$0")"
APP=build/Dev.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
SRC=(Sources/Core/*.swift Sources/Formats/*.swift Sources/Sheet/*.swift Sources/Sheet/Functions/*.swift Sources/Slides/*.swift Sources/Bridge/*.swift Sources/App/*.swift)
swiftc -Onone -module-name HanX -o "$APP/Contents/MacOS/HanX" "${SRC[@]}"
cp Resources/Info.plist "$APP/Contents/Info.plist"
mkdir -p "$APP/Contents/Resources/PDF" "$APP/Contents/Resources/PDFEditor"
cp Tools/pdf/worker.py Tools/pdf/requirements.txt "$APP/Contents/Resources/PDF/"
cp desktop/pdf/* "$APP/Contents/Resources/PDFEditor/"
[ -f Resources/AppIcon.icns ] && cp Resources/AppIcon.icns "$APP/Contents/Resources/"
