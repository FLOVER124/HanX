# PDF editing implementation plan

Goal: edit existing PDF content without importing it into the document model. User authorized implementation, no release in this task.

Architecture: one PDFium worker for CLI/MCP and both GUIs; shared HTML editor in Electron and macOS WKWebView. Local optional Tesseract OCR. No network document uploads. Preserve page geometry and other objects. Save PDF copies, never rasterize whole documents to simulate editing.

1. Add worker with inspect/render/edit/OCR, object IDs scoped to a revision, atomic output. Test real PDF round trips, Korean paths/text, transforms, image replacement, deletion, invalid requests, permissions, rotations and nested form boundaries.
2. Add Swift bridge, CLI and MCP commands and documentation. Package worker beside CLI; provide isolated dependency setup, no silent installs.
3. Add shared PDF UI: page list, object outline/selection, drag, text dialog, position/scale/rotation, fill, image replacement, deletion, undo/redo, save copy, local OCR result dialog. Route native and portable PDF opening to editor. Popups for errors.
4. Verify worker, CLI, GUI integration; self-review and focused independent final review. No release or system installation.

Constraints: do not edit nested shared form content in-place; permit moving whole form objects. Reject changing text with unsupported glyphs rather than losing them. Do not claim deletion is redaction (metadata/annotations/other occurrences can remain). OCR outputs text/boxes, not automatic layout reconstruction. CLI indices zero-based, coordinates unrotated PDF points from bottom-left. Preserve rotated-page visual coordinate mapping.

Implementation and review record:
- Worker: inspect/render and eight mutation operations implemented. Real PDF round-trip tests cover clipping and atomic output; stale IDs rejected by revision hash.
- CLI/MCP: commands and guide added; native macOS OCR uses Vision, portable OCR uses optional Tesseract.
- Shared UI: Electron and WKWebView exercised with actual file, text edit, drag/geometry, delete, history and save. Native lifecycle test delays the first edit and verifies close waits for the dirty-state update.
- Independent review found three important issues (stationary clipping during move, clipping/stroke loss during font replacement, close during first native edit). Fixed via clipping transform, explicit rejection of unsafe font replacement, and queued close coordination. Regression tests added.
- Implementation decision: preserve unsupported clipped/stroked text by rejecting font replacement rather than flattening or dropping its styling. Cost: those text objects need same-font edits or remain unchanged.
- Deferred scope: nested form contents, annotation/form-field editing, automatic paragraph reflow, and bundled Python/Tesseract runtimes. These are documented boundaries, not claimed capabilities.
- No app installation, version bump, release artifact, Git push, npm publication or website deployment in this task.

Continuation: added searchable, invisible OCR text layers, single/all-page CLI and MCP export, GUI insertion and copy. Image render equality checks cover rotated pages and scanned mixed documents.
