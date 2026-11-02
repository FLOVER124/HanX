# Advanced editing source status

This is source work for 2.10.0, not a published release. The user owns subsequent builds and distribution. Public 2.9.1 has not been replaced. Do not restart build, signing, installation or deployment automatically.

## Implemented and checked

- Mac source now supports Vision subject separation on macOS 14+, solid/manual fallback, keep/remove brush refinement, alpha-preserving compositing and current-session original restore. Native changes await compilation/testing by Sol.
- Portable source now includes local U2NetP/ONNX Runtime Web subject separation, keep/remove brush refinement, solid-color mode, transparent PNG and original restoration. No runtime external request is needed; the model and runtime are vendored with hashes and license notices. The existing Electron runtime successfully performed real model inference and cancellation; this is not a benchmark of photographic quality.
- Portable trusted local PNG/JPEG insertion via the native file picker, bounded dimensions and size. Renderer cannot select arbitrary filesystem paths through edit operations.
- Exact slide shape duplication with rich styles, media/table data and animation references, plus front/back ordering.
- Portable image flips, background image rendering, locked-aspect resize with rotated/flipped shapes, contextual typography/fill/stroke controls.
- Portable document orientation/margins and sheet row/column dimensions, actual frozen grid rows/columns, relative formula fill.
- Portable nineteen object animation effects, timeline editing, click/with/after triggers, duration/delay/direction, keyboard slideshow and all 21 transition kinds in HanX’s native model. Pattern geometry approximates the named PowerPoint effects; pixel-identical rendering is not claimed.
- CLI imageData/imageID replacement, duplicate_shape, reorder_shape and set_animations support remains usable through CLI/MCP.

- Portable slide-table insertion and inline text editing now issue bounded set_table_cell operations; complex object-bearing cells are protected. New Swift operation awaits Sol compilation and round-trip tests.

## Verification before build cancellation

Mac CLI 71 tests, desktop 39 tests, native image tests (7 algorithm and 22 integration assertions), clean dialog tests and existing editing checks passed. Real Electron renderer, image editing/save/reopen and existing format smoke passed. Windows/Linux source compilation passed on the initial CI run, but full installer validation did not finish successfully. Windows version fixture and preview test sequencing were fixed; the rerun was cancelled at user request. This is not certification of the new Windows/Linux installers.

## Remaining parity work

Full advanced-tool compatibility is not complete. Remaining work includes native subject-removal runtime verification and photographic edge-quality evaluation; portable structural spreadsheet edits with formula/reference repair, charts, sorting and filters; richer document tables/headers/footers/fields; multi-select align/distribute; additional imported shape rendering. The detailed original audit is in advanced-parity-audit.md. Do not describe the whole application as feature-identical across platforms.

## Astra source checks after build cancellation

Source tests ran using installed Node/Electron only. No compiler, application build, packaging, signing, deployment or CI was run. Checked 46 Node tests, actual local ONNX inference/cancel, browser mask/PNG edit round-trip using the prior CLI binary, renderer controls including table operation dispatch, and rendered transition lifecycle tests. New Swift and table save/reopen tests are written but deliberately not run against the old engine.
