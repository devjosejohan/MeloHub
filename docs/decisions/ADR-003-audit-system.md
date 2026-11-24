# ADR-003 — Local audit system

- **Status:** Accepted
- **Date:** 2026-11-23
- **Scope:** Local audit command and report generation
- **Out of scope:** GitHub Actions, automated QA agent, automatic approvals

## Context

After each development mission, the review process required running several commands manually and sharing the results. We needed a reusable, deterministic and safe way to collect the Git state, run the existing validations and produce a readable report for humans and agents.

## Decision

### 1. Command

`npm run audit` runs a TypeScript script via `tsx`:

```json
"audit": "tsx scripts/audit.ts"
```

The script is framework-independent and does not depend on Astro.

### 2. What it collects

- Current branch and HEAD commit.
- `git status --porcelain=v1 -z` for modified, added, deleted, untracked and renamed files.
- `git diff --stat HEAD` and `git diff HEAD` for tracked changes.
- Content of new untracked and staged text files.
- Results of `npm run typecheck`, `npm run test`, `npm run catalog:editorial` and `npm run catalog:public`.

It reuses the existing validation commands and does not duplicate their logic.

### 3. Report output

Reports are written to `.audit/<audit-id>/`:

- `audit.md` — human-readable summary.
- `audit.json` — structured data for machines and agents.

The `.audit/` directory is ignored by Git.

### 4. Security measures

- `.env` files, `node_modules/`, `.git/`, `dist/`, `coverage/` and `.audit/` are excluded.
- Symbolic links are not followed, either as the final file or as any intermediate directory component; they are excluded with the reason recorded.
- Binary files are skipped by extension and by null-byte detection.
- Files larger than 100 KB are omitted.
- Known secret patterns are redacted from diffs, diff stats, Git error messages, check stdout, check stderr, new file contents and any other textual field, and warnings are recorded.
- Secret patterns tolerate surrounding quotes, escape sequences and common delimiters found in source code.
- Private key blocks (`-----BEGIN ... PRIVATE KEY-----` through `-----END ... PRIVATE KEY-----`) are redacted in their entirety, even when the markers appear indented or quoted.
- If a private key block starts but does not close, the remainder of the content is redacted conservatively.
- Long textual fields are truncated consistently in Markdown and JSON, with a marker indicating truncation and the original size.
- The report never includes environment variables, tokens or credentials intentionally.

Secret detection is heuristic. It reduces risk but cannot guarantee that no secret is present.

### 5. Fail/pass behaviour

- The audit runs all checks even if one fails.
- Git errors are detected and reported explicitly; the audit result is `FAIL` when Git state cannot be collected.
- The overall result is `PASS` only if every check exits with code 0 and Git state was collected successfully.
- Secret warnings do not fail the audit by themselves; they are reported for human review.

### 6. Identifier generation

Audit identifiers include date, time, millisecond and a random suffix to avoid collisions between consecutive runs.

### 7. Cross-platform execution

The script uses Node.js built-in modules (`child_process`, `fs/promises`, `path`, `os`, `crypto`) and runs the same way on Windows, Linux and in future GitHub Actions environments.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| PowerShell-only script | Not portable to Linux or GitHub Actions. |
| Husky git hooks | Would slow every commit and is not required. |
| External audit library | Adds dependency without clear benefit for our scope. |
| Automatic approval if audit passes | Violates the human-approval rule. |

## Consequences

- Reviewers get a consistent report in Markdown and JSON.
- The same checks run locally and can later run in CI.
- No new runtime dependencies are required beyond `tsx`, already installed.
- Test files with example secret strings may trigger warnings; these must be reviewed but are usually false positives.

## Open questions

- GitHub Actions workflow will be implemented in a separate mission.
- Optional QA agent review will be added later, triggered manually.
