# Advanced editing implementation

User request: bring advanced GUI tools to Windows/Mac, particularly image background removal. Retain popup-only instructions and warnings. Existing publication authorization persists; do not create a pkg without a new request.

Existing architecture remains AppKit + Electron with a shared Swift file engine. Full parity is not currently present. See advanced-parity-audit.md for the complete source-backed gaps.

Implemented increment: local edge-connected color background removal with preview, tolerance/color controls, PNG output, undo and current-session original restore on both GUIs. This is solid-color removal, not semantic subject extraction. Also repair exact shape duplication and image/background rendering, expose supported page and sheet layout operations with corresponding rendering, preserve AI/MCP support.

Verification: transparent PNG bytes survive PPTX reopen, clone rich shape/media and ordering, dialog cancellation/undo behavior, pixel flood tests, DOCX margins/XLSX dimensions/freeze/formula save-reopen, native image algorithm and compilation, Electron UI/engine suite, platform CI. Do not label all advanced tools compatible while missing tools remain.

## User build policy update

The user now owns builds and distribution. Do not compile new binaries, run packaging or signing, start CI builds, publish npm/Homebrew/releases, or deploy Pages unless explicitly requested again. Source edits and checks using existing tools/binaries are allowed. Active platform and verify workflows were cancelled on request. Public latest release remains 2.9.1.
