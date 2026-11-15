# Workspace and operations update

App version comes from package.json. Browser extension remains v0.6.4.

- Integrated local @tscircuit/checks 0.0.279 with a validated, source-preserving Circuit JSON adapter and five selectively eligible connectivity/pin-specification checks.
- Added captured JSON uploads, engine-labelled findings, retained checker evidence, reliable reconstructed-component selection and explicit evaluated/skipped/unsupported/failed coverage.
- Retained native KiCad DRC/ERC authority, original source files and no-key operation. Unknown electrical facts and physical geometry are not inferred.
- Pinned runtime dependencies, retained the upstream MIT notice, added four captured fixtures, 13 JavaScript tests and 10 Python integration tests, and documented metadata requirements and limitations.

- Moved extension downloads into Tools and established the upload → analysis → findings → correction → comparison flow.
- Added component/net search, linked native component selection, Previous/Next issue, saved filters and direct evidence/location links.
- Added guided diagnostics, a standalone Windows diagnostic command and downloadable reports.
- Added frequent worker heartbeats, cancellation, explicit fresh retries, attempt isolation and publication fencing.
- Added OS credential storage with verified legacy-key migration and consistent configured-data handling.
- Added project backup/restore and reviewable generated-preview cleanup.
- Extracted workspace data and operations components, removed unbounded frontend `any` handling and generated service contracts from FastAPI.
- Added PR regression checks, a separate native KiCad job, and deterministic release packaging with checksums.

README.md and VERIFICATION.md describe current support and supersede the older unsupported-feature lists. GitHub workflows are staged locally and require a repository commit before they can run remotely.

