#!/bin/zsh
# Install a verified build before retiring older copies on this developer Mac.
set -euo pipefail
SOURCE="${1:?Pass the built HanX.app path}"
DEST=/Applications/HanX.app
CLI=Contents/Resources/CLI/hanx
ROOT="${0:A:h:h:h}"
[[ -d "$SOURCE" && ! -L "$SOURCE" && -x "$SOURCE/$CLI" ]]
codesign --verify --deep --strict "$SOURCE"
"$SOURCE/$CLI" --version >/dev/null
STAGE=$(mktemp -d /Applications/.hanx-install.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT
ditto "$SOURCE" "$STAGE/HanX.app"
codesign --verify --deep --strict "$STAGE/HanX.app"
if [[ -e "$DEST" ]]; then
  /usr/bin/python3 - "$DEST" <<'PY'
import plistlib, pathlib, subprocess, sys, time
app=pathlib.Path(sys.argv[1])
info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
assert info['CFBundleIdentifier'] in ('com.hanword.editor','org.studentsview.hanx','io.hanx.app')
running=subprocess.check_output(['/bin/ps','-axo','comm='],text=True)
if any(p.startswith(str(app)+'/Contents/MacOS/') for p in running.splitlines()):
    subprocess.run(['/usr/bin/osascript','-e','on run argv\ntell application (item 1 of argv) to quit\nend run',str(app)],check=True)
    deadline=time.monotonic()+5
    while True:
        running=subprocess.check_output(['/bin/ps','-axo','comm='],text=True)
        if not any(p.startswith(str(app)+'/Contents/MacOS/') for p in running.splitlines()):break
        if time.monotonic()>=deadline:raise RuntimeError('Save documents and quit HanX.')
        time.sleep(0.1)
PY
  mv "$DEST" "$STAGE/previous.app"
fi
if ! mv "$STAGE/HanX.app" "$DEST"; then
  [[ ! -e "$STAGE/previous.app" ]] || mv "$STAGE/previous.app" "$DEST"
  exit 1
fi
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$DEST"
if [[ -f "$HOME/.config/hanx/local-build-cleanup.json" ]]; then
  /usr/bin/python3 "$ROOT/packaging/macos/clean-previous-builds.py"
fi
print "Installed $DEST"
