# HanX 2.11.0 verification

Published 2026-11-03. GitHub release, npm, Homebrew and Pages are updated. The local Mac app and Homebrew CLI report 2.11.0.

- Mac: universal CLI and GUI compiled. 83 CLI/MCP tests, 416 formula cases, 58 desktop tests and 16 npm tests passed. Native start screen, clean GUI, editing, image background and keyboard interaction suites passed. Real MP4 browser playback and cleanup passed.
- Apple notarization accepted app submission `0cd83525-ed79-43e2-98fe-a5bd6a2e18c4` and CLI submission `afec5c8c-a124-4c09-b94f-0e86a02cf2a6`. The installed app has its notarization ticket stapled and passes Gatekeeper assessment.
- [Windows/Linux build and installer verification](https://github.com/StudentsView/HanX/actions/runs/41592138566) passed at `157af987289bcc4347d13d81166e081a66dcc021`.
- [Release staging and digest verification](https://github.com/StudentsView/HanX/actions/runs/41593292796) passed.
- [Published npm/Homebrew installation verification](https://github.com/StudentsView/HanX/actions/runs/41593523078) passed on both Windows and Linux, including installed component selection, editing, conversion and MCP.
- [Pages deployment](https://github.com/StudentsView/HanX/actions/runs/41593517352) passed. The public config reports 2.11.0.
- Local npm registry installation reports 2.11.0. Local Homebrew upgrade and formula tests passed.

The initial Windows media test expected an exact integer x coordinate. Windows produced a fractional display position within one slide point. The test now applies the same sub-point tolerance on both axes. The complete rerun passed. Application code was unchanged by this test correction.

Full platform feature parity and pixel-identical PowerPoint rendering are not claimed. Imported-video codec support remains platform-dependent. Native video playback uses a sheet; portable slideshow video is inline. No new pkg was built.
