# Local checking dependencies

CircuitCheck integrates the unmodified npm package [@tscircuit/checks](https://github.com/tscircuit/checks), version **0.0.279**. Its license is **MIT**, copyright **2024 tscircuit Inc.** The complete upstream notice is preserved in [public/licenses/tscircuit-checks-MIT.txt](public/licenses/tscircuit-checks-MIT.txt).

The integration uses pinned **circuit-json 0.0.550** for schema validation and **@tscircuit/solver-utils 0.0.25** to satisfy an undeclared runtime import in checks 0.0.279. Other dependencies and peer dependencies are resolved by the committed npm lockfile and retain their own licenses in the installed packages.

Upstream source/API inspection: repository commit `09325251b34f783e3fd1267af166c16310144b66`. Runtime checking uses the pinned npm release rather than the development checkout. No upstream checking code is copied into the adapter.
