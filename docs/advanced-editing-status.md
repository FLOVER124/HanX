Release update, 2026-11-03: 2.11.0 passed the new Mac CLI (83), formulas (416), desktop (58), npm (16), native interaction and GUI suites. Mac app and CLI notarization passed. Windows/Linux native verification passed in run 41592138566 at commit 157af987289bcc4347d13d81166e081a66dcc021. The previous source-only notes below are historical.

# Advanced editing status

Updated 2026-11-03. Release 2.10.0 is published. Subsequent source changes have not been built or released.

## Current source changes

| Area | Added or corrected | Verification |
| --- | --- | --- |
| Slide imports | Image/movie drop placement, Korean names, bounded atomic batches | Portable real-browser tests passed; native runtime pending |
| Video | Embedded PPTX references and bytes, poster, local playback, clipboard media remapping | Real MP4 browser playback/cleanup passed; new CLI/PPTX/native tests await compilation |
| Slide navigation | Context menu, Ctrl/Cmd+C/X/V/D, deletion, text-focus separation, thumbnail navigation | Browser shortcut and menu tests passed |
| Shapes | All 24 native shape kinds render with shared portable SVG geometry | Node geometry tests and browser rendering passed |
| Documents | Paragraph layout without rewriting fields/images, character spacing and superscript/subscript | Browser dispatch passed; new Swift round-trip tests await compilation |
| Sheets | Row/column insertion/deletion, reference and metadata adjustment, native snapshot undo, portable controls | Portable control/validation tests passed; Swift structural tests await compilation |

58 Node tests passed with the existing CLI. Five Electron suites passed on macOS, including real MP4 playback and resource cleanup. These results do not certify Windows/Linux packaged apps or the uncompiled native changes.

Build instructions, exact test files and remaining differences are in [sol-build-handoff.md](sol-build-handoff.md). Full advanced-tool parity is still incomplete. Native movie sheets differ from portable inline playback; media format/codec support, rich document structures, sheet filters and multi-slide selection need additional work.
