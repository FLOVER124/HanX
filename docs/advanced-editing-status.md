# Advanced editing source status

This is source work for 2.10.0, not a published release. The user owns subsequent builds and distribution. Public 2.9.1 has not been replaced. Do not restart build, signing, installation or deployment automatically.

## Implemented and checked

- Mac and portable slide image solid-color background removal, preview, background color selection, tolerance, transparent PNG, current-session original restore, undo/redo. Original bytes remain in the open document; saving/reopening preserves edited PNG transparency. This is not automatic subject segmentation.
- Portable trusted local PNG/JPEG insertion via the native file picker, bounded dimensions and size. Renderer cannot select arbitrary filesystem paths through edit operations.
- Exact slide shape duplication with rich styles, media/table data and animation references, plus front/back ordering.
- Portable image flips, background image rendering, locked-aspect resize with rotated/flipped shapes, contextual typography/fill/stroke controls.
- Portable document orientation/margins and sheet row/column dimensions, actual frozen grid rows/columns, relative formula fill.
- Portable nineteen object animation effects, timeline editing, click/with/after triggers, duration/delay/direction, keyboard slideshow and ten supported transitions. Imported other transitions remain preserved but playback currently cuts; they are not advertised as implemented.
- CLI imageData/imageID replacement, duplicate_shape, reorder_shape and set_animations support remains usable through CLI/MCP.

## Verification before build cancellation

Mac CLI 71 tests, desktop 39 tests, native image tests (7 algorithm and 22 integration assertions), clean dialog tests and existing editing checks passed. Real Electron renderer, image editing/save/reopen and existing format smoke passed. Windows/Linux source compilation passed on the initial CI run, but full installer validation did not finish successfully. Windows version fixture and preview test sequencing were fixed; the rerun was cancelled at user request. This is not certification of the new Windows/Linux installers.

## Remaining parity work

Full advanced-tool compatibility is not complete. Remaining work includes subject-aware photo background removal and mask refinement; portable structural spreadsheet edits with formula/reference repair, charts, sorting and filters; richer document tables/headers/footers/fields; multi-select align/distribute; additional imported shapes and transition rendering. The detailed original audit is in advanced-parity-audit.md. Do not describe the whole application as feature-identical across platforms.
