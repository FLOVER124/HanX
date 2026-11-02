# Advanced editing parity audit

Audit date: 2026-11-02. Static inspection of the current source tree only; this is not a Windows runtime certification or a claim of complete Office compatibility. Source may change while implementation proceeds.

## Architecture and important conclusion

macOS uses the native AppKit UI in `Sources/App`; Windows/Linux use Electron in `desktop`. `Package.swift:15–18` excludes App and Bridge from the portable build. Sharing the Swift document models and file writers therefore does **not** imply equal tools or rendering. The desktop renderer explicitly describes unsupported native controls as omitted (`desktop/renderer.js:66–67`). Its mutation allowlist is narrower than the models (`desktop/engine.cjs:8`).

No existing image background-removal implementation was found in either UI or backend: repository searches for `removeBackground`, `remove_background`, `background removal`, `배경 제거`, and `VNGenerate` had no hits. This is a new feature for both platforms, not an existing native feature awaiting a Windows switch. Solid-color transparency or edge flood-fill can provide a useful deterministic tool, but cannot honestly be described as automatic foreground/subject segmentation. Subject-aware removal requires a cross-platform segmentation implementation/model, distribution and licensing decisions, quality checks, and offline behavior.

## Major feature gaps

| Area | Native evidence | Portable gap / backend readiness |
|---|---|---|
| Document character formatting | `EditorWindowController.swift:491–550`: strike, super/subscript, highlight, spacing, width ratio, reset | `renderer.js:79–82` exposes basic emphasis/color. CLI style parser already accepts strike/highlight (`AgentDocuments.swift:15–29`); super/subscript, spacing and width ratio need parser/UI work. |
| Document paragraph/page layout | `EditorWindowController.swift:491–494,552–564`: spacing, indentation, paragraph gaps, margins, orientation | Portable exposes alignment and width/height. Page setter already handles all margins (`AgentDocuments.swift:179–185`); paragraph parser currently exposes alignment/styleName but not full paragraph spacing/indent controls (`:31–41`). |
| Document structural elements | Native image insertion, page break, header/footer and page numbering (`EditorWindowController.swift:493,557–561`) | Portable insertion only adds paragraphs and a fixed 2×2 table. CLI block constructor only accepts paragraph/table (`AgentDocuments.swift:75–83`). Rich image/field paragraphs and complex table cells are intentionally read-only (`desktop/engine.cjs:57–60`). Need media import plus non-destructive editing operations. |
| Spreadsheet data/structure | `SheetDocument.swift:705–707`: row/column insert/delete, autofit, rename, charts, sort, fill down/right, series, autosum | Portable lacks these workflows (`renderer.js:86–89`). CLI already supports `fill_formula`, row height, column width and names (`AgentSheets.swift:12,153–163`); structural shift/formula repair and sorting remain in AppKit controller (`SheetDocument.swift:442–545`) and need extraction/portable operations. |
| Spreadsheet styles/view | Native wrapping, borders, decimal shortcuts, clear formatting, freeze toggle | Portable lacks these controls and visual behavior. The portable grid does not apply frozen rows/columns or stored row/column dimensions, and does not render charts (`renderer.js:31–35`). Persisting freeze metadata alone is not visible freezing. |
| Slide insertion/formatting | Native image/table/line and many shapes; text/paragraph formats; fill/line; aspect, flips (`SlideDocument.swift:988–990`) | Portable inserts only text/rectangle and exposes geometry/rotation/fill (`renderer.js:61–64,93–96`). CLI `shape()` already accepts shapes, tables, text styles, line, flips, aspect and filesystem image input (`AgentDocuments.swift:96–122`). Renderer IPC deliberately rejects filesystem image paths (`engine.cjs:14`), so image insertion needs a trusted main-process picker/import operation. |
| Slide arrangement | Native multi-select align/distribute and front/back (`SlideDocument.swift:990,1044–1047`) | Portable only has single selected shape, geometry and simplified duplicate. Existing `shapeSpec()` copies only kind/frame/rotation/fill/text, dropping image/table/style details (`renderer.js:54`); use model-preserving duplication before exposing it broadly. |
| Slide background | Native color/image background (`SlideInspector.swift:565–569`, `SlideDocument.swift:704–710`) | Portable stage and thumbnails use only background color (`renderer.js:39,45`), ignoring `backgroundImage`; no editing control. CLI creation accepts background color but no dedicated existing-slide background op (`AgentDocuments.swift:125–138`). |
| Animation and slideshow | Native inspector creates/reorders/edits effects/triggers/delay (`SlideInspector.swift:579–676`); real playback in `SlideShow.swift` | Portable has no animation editor or slideshow. CLI slideOps does not include animation mutation (`AgentDocuments.swift:10`), though models preserve animations (`SlideModel.swift:157`). Needs operations plus browser playback implementation. |
| Transitions | Native all enum effects, options, preview, apply-all (`SlideDocument.swift:991`) | Portable lists only none/cut/fade/push/wipe; preview implements just fade/push/wipe, with fixed direction (`renderer.js:60,96`). CLI already supports duration, direction, timed/click advance, vertical/inward (`AgentDocuments.swift:86–94`); do not expose additional effects as working until browser playback exists. |

## Feasible incremental delivery

1. Expose already-supported, end-to-end verifiable operations: document strike/highlight and margins; sheet wrap/border and dimensions with real rendering; shape types, typography, lines, flips/aspect; transition direction/options only when preview follows them.
2. Add safe local image import to both interfaces and portable rendering of existing background images. Preserve original image assets, provide undo, validate encoded media and test save/reopen.
3. Implement explicit **color background removal** consistently for both platforms, with tolerance, clear limits and transparent PNG output. Add true subject segmentation only when the actual engine is chosen and tested. Never equate the two.
4. Extract structural spreadsheet operations and full slide animation/arrangement into shared portable operations. Port the UI independently and validate behavior, not merely button presence.

## Release blockers for “all advanced tools compatible”

- Multiple editing operations exist only inside AppKit controllers; others do not exist at all.
- Browser rendering omits persisted features (background images, charts, dimensions, freezing) and playback.
- Feature import/export preservation is bounded: `AgentSheets.swift:13` explicitly warns that unsupported Excel objects, pivots, macros and connections may be omitted. Native feature availability is not evidence of lossless Office round-trip fidelity.
- Native and portable pipelines need separate save/reopen fixtures and UI interaction tests. Windows installation, image transparency, fonts, printing/PDF and keyboard behavior require actual Windows verification. A passing macOS-hosted portable test suite alone cannot certify Windows parity.

No application code was changed for this audit.
