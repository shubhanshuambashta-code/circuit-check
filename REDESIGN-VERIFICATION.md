# Frontend redesign verification — 14 November 2026

Implemented on `frontend-upgrade`; no push or merge. Backend files and API contracts are unchanged.

- `npm run build`: passed (TypeScript and local production bundle).
- `npm run build:pages`: passed (static recording, repository base path).
- `python -m pytest -q`: 44 passed, 12 skipped. All skips require the absent native KiCad installation. One existing dependency deprecation warning.
- Existing Pages browser workflow: passed, including revision object highlights, synchronized comparison views, schematic findings, coverage, local setup dialog, native ZIP download and widths 1440/1024/768/390/360.
- Added landing browser workflow: passed, including project action, mobile menu, section navigation, responsive widths and reduced motion.
- Existing local Playwright suite: executed with a 15-second per-test limit; all seven tests failed while awaiting completed native analysis. Uploads and dialogs worked, but the worker reports KiCad unavailable. These tests do not establish passing live analysis or correction workflows on this host.
- Dev server responds HTTP 200 at `http://127.0.0.1:5173/`; existing API and worker started on port 8000.

The installed shell had no Node/npm/Python on PATH. Ignored `data/tools` contains Node 24.11.1 and npm 11.6.2; `.venv` uses the available Python 3.10.0 with the pinned direct requirements. This older Python runtime is below the project's documented recommendation; it was sufficient for the executed unit tests and API startup. No runtime or dependency changes were committed.

The template's source archive and MIT notice were inspected before adaptation; see `TEMPLATE-NOTICE.md`. No sales simulations, invented testimonials or unsupported capability claims were retained. Browser preview connector was unavailable; automated Chrome tests and their screenshots supplied visual verification.
