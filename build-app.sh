#!/bin/zsh
# Builds HanX.app (universal: arm64 + x86_64) into build/, then installs to /Applications.
set -e
cd "$(dirname "$0")"
APP=build/HanX.app
[[ ! -L "$APP" ]] || { print -u2 "Build output is a symlink: $APP"; exit 1; }
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
SRC=(Sources/Core/*.swift Sources/Formats/*.swift Sources/Sheet/*.swift Sources/Sheet/Functions/*.swift Sources/Slides/*.swift Sources/Bridge/*.swift Sources/App/*.swift)
for arch in arm64 x86_64; do
  swiftc -O -module-name HanX -target $arch-apple-macos13.0 -o build/HanX-$arch "${SRC[@]}"
done
lipo -create build/HanX-arm64 build/HanX-x86_64 -output "$APP/Contents/MacOS/HanX"
rm build/HanX-arm64 build/HanX-x86_64
cp Resources/Info.plist "$APP/Contents/Info.plist"
mkdir -p "$APP/Contents/Resources/PDF" "$APP/Contents/Resources/PDFEditor"
cp Tools/pdf/worker.py Tools/pdf/fonts.py Tools/pdf/requirements.txt "$APP/Contents/Resources/PDF/"
cp desktop/pdf/* "$APP/Contents/Resources/PDFEditor/"
[ -f Resources/AppIcon.icns ] && cp Resources/AppIcon.icns "$APP/Contents/Resources/"
cp Resources/Credits.rtf LICENSE NOTICE "$APP/Contents/Resources/"
mkdir -p "$APP/Contents/Resources/Maintenance"
cp packaging/macos/clean-previous-builds.py "$APP/Contents/Resources/Maintenance/"
CLI_PATH="${HANX_CLI_PATH:-$PWD/build/hanx-cli}"
[[ -x "$CLI_PATH" ]] || { print -u2 'Build the standalone CLI first with ./build-cli.sh --universal'; exit 1; }
APP_VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' Resources/Info.plist)
CLI_VERSION=$("$CLI_PATH" --version | /usr/bin/plutil -extract data.version raw -o - -)
[[ "$APP_VERSION" == "$CLI_VERSION" ]] || { print -u2 "App/CLI versions differ: $APP_VERSION / $CLI_VERSION"; exit 1; }
mkdir -p "$APP/Contents/Resources/CLI"
cp -p "$CLI_PATH" "$APP/Contents/Resources/CLI/hanx"
mkdir -p "$APP/Contents/Resources/CLI/pdf"
cp Tools/pdf/worker.py Tools/pdf/fonts.py Tools/pdf/requirements.txt "$APP/Contents/Resources/CLI/pdf/"
cp docs/cli/README.md "$APP/Contents/Resources/CLI/README.md"
cp -R docs/cli/examples "$APP/Contents/Resources/CLI/examples"
cp LICENSE NOTICE "$APP/Contents/Resources/CLI/"
printf 'APPL????' > "$APP/Contents/PkgInfo"
codesign --force --sign - "$APP" >/dev/null
if [ "$1" = "--install" ]; then
  ./packaging/macos/install-local.sh "$PWD/$APP"
fi
