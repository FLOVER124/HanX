# HanX 2.12.0 verification

Published 2026-11-03. The local app and Homebrew CLI report 2.12.0. Version checks report `Up to date` against the public registry.

- Mac universal app and CLI compiled. 83 CLI/MCP tests, 416 formula cases, 58 desktop tests and 23 launcher/updater tests passed.
- The installed app passes system execution assessment. App and CLI notarization were accepted as `38db7995-dfe2-4a97-ad6e-7eaccb7472fc` and `629b772b-b28a-465e-80f8-8a8fd1ffd988`.
- Native clean GUI and start screen suites passed. A test build initially overlapped checkout file timestamp updates; it was rerun against the fixed checkout and passed.
- Browser QA passed at desktop and mobile widths: app icon, rounded font loading, extension counter, reduced-motion behavior, tabs, version comparison and guide layout.
- Self-update was exercised in an isolated npm prefix with a test bootstrap marked 2.11.0. `--update` installed the real published 2.12.0 package, verified its installed metadata and subsequently reported `Up to date`.
- [Windows/Linux native builds and installers](https://github.com/StudentsView/HanX/actions/runs/41596660935) passed at `c277814684d4195fa568e9d70cb09ca2e4e0f7ca`.
- [Public npm/Homebrew component, editing, conversion and MCP installation checks](https://github.com/StudentsView/HanX/actions/runs/41598909897) passed after updating the GUI-only validation rule. GUI-only installations allow version queries and keep document commands disabled.
- [Pages deployment](https://github.com/StudentsView/HanX/actions/runs/41598415021) passed. The same design is deployed in the owner-private Sites preview at https://hanx-documents.exoticalder1.chatgpt.site.

`--update` is provided by npm and Homebrew launchers. Direct archive installations expose `--check-update` and are replaced using the current download. Automated native `--version` output retains local-version JSON; interactive version output also checks the current release. Offline lookup reports `Version check unavailable`.
