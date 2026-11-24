---
name: security-phase-gate
description: >
  Apply a proportionate security review and validation gate at the end of each
  implementation phase. Review dependency changes when manifests or lockfiles
  change, and run focused security tests for affected behavior. Use for TyORM
  development phases, security-sensitive changes, dependency updates, and
  security validation requests.
---

# Security phase gate

Apply this workflow at the end of every implementation phase. Scale the checks
to the changed attack surface: run focused security tests for affected behavior,
not the entire security program after every unrelated edit. A passing test suite
or dependency audit is evidence for its scope, not a certification of security.

## 1. Scope the change

Before validating, inspect the actual diff and identify:

- New or changed trust boundaries, user-controlled inputs, SQL, identifiers,
  permissions, authentication, TLS, routines, transactions, resource handling,
  logging, and secret/configuration paths.
- Changed package manifests, workspace configuration, and lockfiles.
- The relevant existing tests and the smallest commands that exercise the
  changed behavior.

Do not infer safety from the phase title. Follow data from its entry point to
the operation that consumes it.

## 2. Run focused security validation

For each phase:

1. Run existing tests that exercise the changed security boundary.
2. When behavior at that boundary changes, add or update a focused regression
   test that would fail if the protection were absent. Exercise both expected
   behavior and relevant invalid or adversarial inputs.
3. Run the affected package's typecheck and build where applicable; run its
   normal tests for regression coverage.
4. At phase closure, run the broader workspace checks when practical. If a
   check cannot run, report it as not run with the reason; never imply that
   unrelated tests establish security.

Choose tests according to the code, for example:

- SQL: confirm values remain bound parameters, identifiers are quoted or
  rejected, and malformed input cannot change query structure.
- Transactions and connections: confirm original errors remain visible,
  rollback/release occurs, and a failed operation does not leave reusable
  state unsafe.
- TLS and credentials: verify trusted certificates succeed and invalid CA or
  host identity fails; ensure secrets do not appear in output or artifacts.
- Database integrations: use synthetic data, an explicitly isolated
  disposable database, and a non-administrative account whose effective
  permissions have been verified. Do not rely on an opt-in environment flag
  alone to prove isolation.

Do not run destructive integration tests against production or an unverified
database. Do not weaken validation or disable TLS checks to make tests pass.

## 3. Review dependencies at the right cadence

Dependency auditing is not required after every code-only phase. Perform it:

- Whenever a manifest, workspace dependency declaration, or lockfile changes.
- Before a release and at least monthly for an actively maintained project.
- When a relevant advisory or suspected vulnerable dependency is reported.

For this pnpm workspace, run `pnpm audit` after dependency changes and record
the date, result, and any network or registry limitation. Inspect the manifest
and lockfile diff to confirm the intended versions are actually resolved.
Determine whether each advisory affects a production or development dependency,
the affected version range, whether the vulnerable code path is used, and the
available patched version. Do not dismiss an advisory solely because it is
transitive or development-only.

Do not apply broad overrides or major upgrades solely to silence an audit.
Prefer the smallest compatible update, then run the affected tests, typecheck,
and build. If no fix is available, document exposure, severity, mitigations,
owner or follow-up, and reassessment timing. If the registry is unavailable,
record the audit as blocked; do not claim there are no known advisories.

## 4. Record evidence and findings

At phase completion, report and, where appropriate, update `AGENTS.md` with:

- The code and boundary reviewed.
- Exact validation commands and pass/fail/skip counts.
- Dependency audit date and result when due.
- Confirmed findings separately from hardening recommendations, including
  severity, evidence, preconditions, impact, and confidence.
- Checks not run, environmental constraints, and residual risks.

Do not report a vulnerability based only on a hypothetical possibility.
Reproduce or trace the path from an actual input or configuration to the
security impact. Do not state that the system is secure based only on tests,
static review, or a clean dependency audit.

## Completion checklist

- [ ] Reviewed the phase diff and identified its security-relevant boundaries.
- [ ] Ran focused tests for changed boundaries, or recorded why none apply.
- [ ] Ran affected regression checks and disclosed failures or omissions.
- [ ] Audited dependencies if a manifest/lockfile changed, or the periodic/release
      review is due.
- [ ] Recorded evidence and residual risk without overstating coverage.
