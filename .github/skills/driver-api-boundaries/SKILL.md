---
name: driver-api-boundaries
description: >
  Review and maintain public API boundaries and encapsulation for TyORM
  database-driver packages. Use when adding or changing driver providers,
  package exports, connection or compiler classes, or deciding which driver
  implementation details should be public or internal.
---

# Driver API boundaries

Use this workflow for driver API and encapsulation changes. Its purpose is to
prevent accidental coupling and unsafe capability exposure, not to sandbox
code that already runs in the application process.

## 1. Inspect the actual package surface

Before editing, inspect:

- The driver's `src/index.ts`, `package.json` `exports` and `files`, build
  configuration, and generated entry-point declarations.
- The Core contracts implemented by the driver, including
  `DatabaseDriver`, `DatabaseConnection`, `DriverProvider`, and `SqlCompiler`.
- Consumers in Core, other drivers, examples, tests, and package READMEs.
- The corresponding PostgreSQL, MySQL, and SQLite implementations. Compare
  behavior and intended contracts; do not assume one driver is authoritative
  for dialect-specific behavior.

Check both the package-root exports and whether package subpath imports are
available. A source-level export is not necessarily part of a published API,
and a class's location or name alone does not determine whether it is public.

## 2. Classify each capability

For every candidate export, record its intended consumers and classify it:

- **Application entry point:** normally the provider factory used by
  `DataSource`.
- **Supported extension contract:** types or classes consumers need to
  implement a custom driver, compiler, or provider.
- **Advanced capability:** direct drivers, connections, raw SQL execution,
  procedure APIs, or compiler constructors needed for documented low-level
  workflows.
- **Internal implementation:** pools, concrete connection plumbing, compiler
  helpers, query/metadata resolvers, transaction contexts, and other symbols
  that are not required by the supported package API.

Keep an advanced capability public only when its use is intentional and
documented. In particular, a `DatabaseConnection` can grant the caller the
ability to execute SQL outside `DataSource`'s entity/query validation; treat it
as a privileged capability, not as an ordinary data object or a trust boundary.

## 3. Enforce the package boundary

- Prefer explicit named exports from a driver's package root. Avoid wildcard
  exports that unintentionally expose compiler or connection helpers.
- Restrict `package.json` `exports` to supported public entry points. Keep
  package files limited to intended distribution artifacts and do not add
  source-directory subpaths without a concrete compatibility requirement.
- Internal modules may export symbols between implementation files, but do
  not re-export them from the package root solely for tests. Tests should
  import internal source paths directly.
- Preserve intentional public contracts. If removing a documented export is
  necessary, describe the compatibility impact and update its supported
  replacement in the same change.
- Use runtime checks for released/closed connections, transaction-scope
  ownership, and invalid operations. TypeScript `private` and `protected`
  modifiers are not runtime authorization. ECMAScript `#private` may provide
  runtime member encapsulation, but neither form isolates mutually trusted
  code inside one process.

## 4. Validate the public boundary

Add focused coverage when a public surface changes:

- Assert intended package-root exports remain available and selected internal
  symbols are absent.
- Verify supported package imports work and unsupported deep imports fail
  through the package's `exports` map, using a consumer fixture or Node package
  self-reference where appropriate.
- Build declarations and typecheck a representative consumer or the workspace
  packages that depend on the driver.
- Test lifecycle and transaction guards if public methods or capabilities
  change.
- Run database integrations only when SQL, connection, or transaction behavior
  changes, and only against verified disposable databases with non-admin test
  accounts.

Run the affected package's typecheck, build, and tests. Run workspace
regressions when the Core contracts or multiple drivers are affected. Follow
`security-phase-gate` for broader phase-level security validation and dependency
audit cadence; do not run dependency audits for driver-only code changes unless
they change dependencies or an audit is due.

## 5. Document the result

Update the driver README with its provider usage, intentional public exports,
advanced capabilities, engine-specific limitations, and package test commands.
Update Core documentation when a shared contract or package boundary changes.
At phase closure, record commands and pass/fail/skip counts, compatibility
effects, and residual risks in `AGENTS.md` when they affect the project roadmap.
