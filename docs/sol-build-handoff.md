# HanX Astra → Sol handoff

Updated 2026-11-03. Public release remains 2.10.0. The changes below are source work after that release. No new application build, CLI compilation, installer, signing, notarization, deployment or CI run was performed for this work. Installed binaries still contain the released implementation.

## Role and workspace

The user assigns feature implementation to GPT-6 Astra and builds/distribution to GPT-6.1 Sol. Do not start build/CI/publish merely because source is complete. No new pkg unless explicitly requested. Source commits use `[skip ci]`.

Editable source is `/Applications/HanX-Source`. The public Git checkout is under the project work directory at `work/hanword-release-2026-10-30/public`. Preserve user-edited README and legal wording. Do not write through `build/HanX.app`, which points at the installed app.

## New source

- Slide image and movie drag/drop, including Korean filenames and placement at the drop point. Imports prepare the batch before editing. Portable imports accept PNG/JPEG and MP4/M4V, up to 16 files and 16 MiB total. Native image picker retains existing image-format support and normalizes imported pictures to PNG. New pictures are bounded to 16 million pixels.
- Embedded movie data is referenced by optional `SlideShape.videoID`; `imageID` remains its poster. PPTX writer adds video/media relationships, content types and video timing; reader retains embedded bytes. Native and portable clipboard paths include/remap both references. CLI `videoData` supports bounded MP4/M4V insertion with an optional PNG `imageData` poster.
- Portable editor preview and slideshow use local HTML video. Navigation and close pause and release video resources. Native editor double-click and slide-show click use AVKit in a dismissible sheet. Native asset reference restrictions prevent movie references from reading other locations. No remote movie fetching.
- Portable slide thumbnails handle context-menu cut/copy/paste/duplicate/delete, Ctrl/Cmd+C/X/V/D and Delete/Backspace. Menu-bar clipboard actions route to thumbnails or ordinary text editing according to focus. Up/Down/Home/End navigate thumbnails; the context-menu key and Shift+F10 open the slide menu.
- Portable SVG geometry covers the 24 native shape kinds and is shared by stage, thumbnail and slideshow rendering.
- Document paragraph layout operation changes alignment, indentation, spacing and page breaks without rebuilding inlines. Character styling includes superscript/subscript and spacing. Development sessions retain compatibility with the previously released engine's text-layout behavior.
- Shared sheet row/column insertion/deletion adjusts formulas, names, dimensions, merged cells, freeze boundaries and chart source ranges. Native undo/redo restores the workbook snapshot. Portable data ribbon and CLI expose all four operations. Unsupported formula syntax, ambiguous unqualified defined names, spill intersections, out-of-bounds shifts and complete chart-source deletion are rejected before mutation.

## Verified using existing runtimes

- `cd desktop && npm test`: 58 tests passed. Integration tests use the existing 2.10.0 CLI, so this does not validate newly added Swift operations.
- Existing Electron ran `test/renderer-ui.cjs`, `test/slide-media-ui.cjs`, `test/presentation-playback-ui.cjs`, `test/sheet-chart-data-ui.cjs` and `test/slide-arrangement-ui.cjs`, all passed on this Mac. Renderer tests mock the native IPC boundary. The media test decodes and plays a real generated H.264 MP4 through the app CSP and checks cleanup on slide navigation/close.
- JavaScript syntax checks and Python test syntax checks passed.
- `desktop/test/fixtures/clip.mp4` is a generated two-second solid-blue H.264 fixture with no audio or third-party media. FFmpeg was used to make the test fixture; no app was built.

## Required after a Sol build

1. Compile CLI and native Mac GUI from the new source, then run the full AgentCLI suite, including `test_sheet_structure.py` and the new movie/paragraph tests in `test_cli.py`. These tests have NOT run against a newly compiled engine.
2. Run `Tests/run-editing.sh`; new native movie clipboard and PPTX round-trip assertions are included. Run the existing interaction, clean GUI and image-background suites.
3. Check native drag/drop, insert-dialog imports, Korean/space filenames, multi-file failure atomicity, undo/redo, double-click playback, slideshow playback, closing the parent window and cleanup of temporary movies. Verify preserved video and poster bytes after PPTX save/reopen and cross-document paste.
4. Run the same Electron tests on Windows/Linux and in packaged apps with the new bundled CLI. Test the generated H.264 fixture and real supported videos. Windows/Linux runtime and codec behavior has NOT been verified in this source turn. CI definitions include the new media and sheet tests, but no workflow was started.
5. Open exported embedded-video PPTX in PowerPoint and check playback, duplicate slides and animations. This interoperability check is pending.
6. Only when authorized to distribute, bump versions, rebuild/sign/notarize as needed, use new checksums and update npm/Homebrew/GitHub consistently. Do not reuse previous binaries or infer that an npm credential is valid.

## Remaining differences

Do not claim full platform parity. Native movie playback currently uses a sheet while portable slideshow playback is inline. Native and portable media poster generation differ. Codec support depends on the platform; imported unsupported video bytes may survive PPTX round-trip without being playable locally. Portable image import accepts fewer image formats than the native picker. Headers, footers, advanced document tables, filters, multi-slide selection and other advanced editor tools still need parity work. Background removal algorithms differ between macOS Vision and portable U2NetP. Exact PowerPoint transition rendering is not claimed.
