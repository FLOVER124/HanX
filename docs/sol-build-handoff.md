# HanX Astra → Sol handoff

## Role rule from the user

The user identifies the model each turn. GPT-6 Astra implements features and edits source. GPT-6.1 Sol handles compilation, builds, installer creation and deployment. Do not start build/CI/signing/publish merely because code is complete. No new pkg unless explicitly requested. Source-only commits use [skip ci].

## Current source

/Applications/HanX-Source is the editable source; the public checkout mirrors it on advanced-editing-2.10.0. Public latest release remains 2.9.1. Version metadata 2.10.0 describes the candidate source, not a shipped build. Existing locally notarized 2.10.0 candidates predate subject segmentation, full transitions and table editing: DO NOT PUBLISH THOSE OLD BINARIES. Rebuild from the final source commit when authorized.

## New source after the previous binary

- Native Vision request (macOS14+), full-resolution EXIF-normalized mask, original-alpha compositing and keep/remove brush. macOS13 retains manual/solid fallback. Native code has NOT been compiled since these changes.
- Portable offline U2NetP model and ONNX Runtime Web runtime under desktop/assets/segmentation. Model and prebuilt runtime were copied, not compiled. manifest.json pins byte sizes/SHA256 and primary-source licensing evidence; retain NOTICE/license files. Existing assets/** packaging should include them. Verify installed Windows/Linux Worker/WASM/file-URL CSP behavior, not just source execution.
- All native model transition kinds are browser-rendered. Inspect visual samples and auto/click/keyboard timing; effects are not claimed to reproduce PowerPoint pixel-for-pixel.
- Slide table insert/edit module. set_table_cell preserves plain-cell formatting and rejects object-bearing cells; Swift implementation and new Python round-trip test need a newly compiled CLI.
- Fix desktop edit allowlist to include set_animations and set_table_cell; source tests should guard these.

## Checks for Sol, when authorized

1. Compile the native CLI, portable CLI, and Mac GUI. Run Tests/AgentCLI, both native image suites, CleanGUI and editing regressions with the NEW binary.
2. Run npm test in desktop, plus installed Electron test/renderer-ui.cjs, test/image-tools-ui.cjs, test/subject-segmentation-ui.cjs and test/presentation-playback-ui.cjs. These are source tests, not packaging commands.
3. Native manual validation: real photographs, portrait/landscape/mirrored EXIF, keep/remove strokes at corners, semitransparent input, repeated edit after removal, cancel or switch modes while inference runs, failed Vision detection, macOS13 fallback, undo/redo, save/reopen PNG transparency.
4. Portable manual validation: same image cases; photo-quality/edge failures; offline launch, damaged/missing model, inference cancellation/timeout and packaged runtime asset loading.
5. Re-run Windows/Linux installer and distribution tests from the exact final commit. Earlier run 41392325126 failed stale Windows version checks and preview-test sequencing; those were fixed. Reruns were CANCELLED by user request; there is no successful final Windows/Linux installer certification.
6. When distribution is explicitly authorized: rebuild all artifacts, sign/notarize Mac artifacts, use fresh checksums, update release manifest/npm/brew/site consistently, and preserve user's README/legal wording. Never re-use obsolete candidate archives or infer npm token validity; credentials stay in Keychain.

## Known remaining limits

Full native/portable advanced-tool parity is not complete. Rich document structural tools, sheet structural edits/reference repair/charts/sorting, multi-select arrangement and additional imported shape geometries remain separate work. Small U2NetP model may need manual edge correction; Mac Vision and U2NetP do not guarantee identical masks. Session original-image restoration is not persisted as editable provenance across closing/reopening a PPTX; edited PNG itself persists.
