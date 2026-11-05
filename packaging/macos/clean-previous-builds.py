"""Remove superseded developer builds on Macs opted in to single-build installs."""
import argparse
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess

HOME = Path.home()
APP = Path("/Applications/HanX.app")
CLI = APP / "Contents/Resources/CLI/hanx"
CONFIG = HOME / ".config/hanx/local-build-cleanup.json"
APP_IDS = {"com.hanword.editor", "org.studentsview.hanx", "io.hanx.app"}
SCOPES = ("@flover124/hanx", "@juyoungsuh/hanx", "@hangulx/hanx")


def is_product(app):
    if app.is_symlink() or not app.is_dir():
        return False
    try:
        with (app / "Contents/Info.plist").open("rb") as source:
            info = plistlib.load(source)
        return (info.get("CFBundleIdentifier") in APP_IDS
                and info.get("CFBundlePackageType") == "APPL"
                and (app / "Contents/MacOS" / info["CFBundleExecutable"]).is_file())
    except (OSError, KeyError, ValueError, plistlib.InvalidFileException):
        return False


def discover(roots):
    candidates = set()
    for parent in (Path("/Applications"), HOME / "Applications"):
        candidates.update(parent.glob("*.app"))
    for root in roots:
        for directory, children, files in os.walk(root):
            keep = []
            for name in children:
                child = Path(directory) / name
                if name.endswith(".app"):
                    candidates.add(child)
                elif (not name.startswith(".") and name not in
                      ("node_modules", "Pods", "vendor") and not child.is_symlink()):
                    keep.append(name)
            children[:] = keep
    return sorted(app for app in candidates if app.resolve() != APP.resolve() and is_product(app))


def configure_commands():
    bin_dir = HOME / ".local/bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    for name in ("hanx", "hanx-cli"):
        link = bin_dir / name
        if link.exists() or link.is_symlink():
            if link.resolve() == CLI:
                continue
            target = link.resolve()
            if not link.is_symlink() or not any(
                (target.parent / marker).is_file()
                for marker in ("HANX-CLI-VERSION", "HANWORD-CLI-VERSION")
            ):
                raise ValueError(f"기존 명령의 소유자를 확인하세요: {link}")
            link.unlink()
        link.symlink_to(CLI)


def clean_managers():
    brew = shutil.which("brew")
    if brew:
        formulas = subprocess.check_output([brew, "list", "--formula", "--full-name"], text=True)
        for formula in formulas.splitlines():
            if formula.lower() in ("hanx", "flover124/tap/hanx", "studentsview/tap/hanx"):
                subprocess.run([brew, "uninstall", "--force", "--formula", formula], check=True,
                               env=dict(os.environ, HOMEBREW_NO_AUTOREMOVE="1"))
    npm = shutil.which("npm")
    if npm:
        root = Path(subprocess.check_output([npm, "root", "-g"], text=True).strip())
        packages = []
        for name in SCOPES:
            manifest = root / name / "package.json"
            if manifest.is_file() and json.loads(manifest.read_text()).get("name") == name:
                packages.append(name)
        if packages:
            subprocess.run([npm, "uninstall", "-g", "--ignore-scripts", *packages], check=True)


def clean_cli_versions():
    for product, name in (("HanX", "hanx"), ("HanWord", "hanword")):
        base = HOME / "Library/Application Support" / product / "CLI"
        for version in base.glob("*"):
            if version.is_symlink() or not re.fullmatch(r"\d+\.\d+\.\d+", version.name):
                continue
            marker = version / (product.upper() + "-CLI-VERSION")
            engine = version / name
            if marker.is_file() and marker.read_text().strip() == version.name and engine.is_file():
                for alias in (name, name + "-cli"):
                    link = HOME / ".local/bin" / alias
                    if link.is_symlink() and link.resolve() == engine:
                        link.unlink()
                recycle(engine)


def recycle(path):
    # The system Trash utility chooses a unique destination on the same volume.
    subprocess.run(["/usr/bin/trash", str(path)], check=True)
    if path.exists():
        raise OSError(f"휴지통 이동 실패: {path}")
    print(f"정리함  {path}", flush=True)


def close_previous_apps(apps):
    processes = subprocess.check_output(["/bin/ps", "-axo", "comm="], text=True).splitlines()
    for app in apps:
        if any(process.startswith(str(app) + "/Contents/MacOS/") for process in processes):
            script = 'on run argv\ntell application (item 1 of argv) to quit\nend run'
            subprocess.run(["/usr/bin/osascript", "-e", script, str(app)], check=True)
    processes = subprocess.check_output(["/bin/ps", "-axo", "comm="], text=True).splitlines()
    for app in apps:
        if any(process.startswith(str(app) + "/Contents/MacOS/") for process in processes):
            raise ValueError(f"문서를 저장하고 이전 앱을 종료하세요: {app}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not CONFIG.is_file():
        return
    if os.geteuid() == 0 or not is_product(APP) or not CLI.is_file():
        raise ValueError("새 앱과 CLI를 설치한 사용자 계정에서 실행하세요.")
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", APP], check=True)
    result = json.loads(subprocess.check_output([CLI, "--version"], stdin=subprocess.DEVNULL))
    if not result.get("ok"):
        raise ValueError("새 CLI 버전을 확인할 수 없습니다.")
    config = json.loads(CONFIG.read_text())
    roots = [Path(value).expanduser().resolve() for value in config["buildRoots"]]
    if any(root == HOME or not (HOME in root.parents or root == Path("/Applications/HanX-Source/build"))
           for root in roots):
        raise ValueError("빌드 폴더 경로를 확인하세요.")
    previous_apps = discover(roots)
    if args.dry_run:
        for app in previous_apps:
            print(app)
        return
    close_previous_apps(previous_apps)
    configure_commands()
    clean_managers()
    configure_commands()
    clean_cli_versions()
    for app in previous_apps:
        recycle(app)


if __name__ == "__main__":
    main()
