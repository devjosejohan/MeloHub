# ADR-002 — Catalog data pipeline

- **Status:** Accepted
- **Date:** 2026-11-23
- **Scope:** Discovery, loading, editorial validation and public generation of record files
- **Out of scope:** Astro integration, page rendering, search indexing, UI

## Context

The data model and validation rules are already defined. The next step is to feed them from the filesystem in a deterministic, testable and safe way, so that the public catalog can never contain drafts or invalid published records by accident.

The pipeline must:

- keep content separate from implementation;
- remain framework-independent so Astro can consume it later;
- be deterministic and testable without real filesystem permissions;
- fail closed when public safety is at risk;
- surface every editorial error, including invalid drafts.

## Decision

### 1. Record storage

Records live in `data/records/` as one JSON file per record.

- Each file is named exactly `<id>.json`.
- IDs are stable kebab-case slugs and are not reused.
- The directory is flat: no subdirectories by category, status or kind.
- Editorial status is controlled by the `status` field, not by file location.

A flat layout was chosen because:

- a record can belong to multiple categories;
- moving files to publish or archive would be error-prone;
- it keeps diffs small and Git history clear.

### 2. Pipeline modules

Responsibilities are split into small modules under `src/data/pipeline/`:

- `types.ts` — contracts for readers, issues and results.
- `reader.ts` — default Node.js filesystem reader.
- `discovery.ts` — deterministic discovery of record files.
- `load.ts` — `loadEditorialCatalog()` and `loadPublicCatalog()`.
- `index.ts` — public facade.

The pipeline reuses the existing `validateRecord()`, `validateCatalog()` and `toPublicCatalog()` functions. It does not duplicate their rules.

### 3. File discovery

`discoverRecords()`:

- lists the immediate contents of `data/records/`;
- ignores hidden files and non-JSON files (e.g. `README.md`);
- rejects subdirectories;
- rejects filenames that are not valid kebab-case IDs;
- returns files sorted by path for deterministic validation order.

### 4. Reader abstraction

A minimal `FileSystemReader` interface is used so that tests can simulate errors (unreadable files, missing directories) without changing permissions on the real filesystem.

### 5. Editorial loading

`loadEditorialCatalog()`:

- discovers, reads and parses every `.json` file;
- reports read errors, parse errors, filename mismatches and structural validation errors with the file path;
- runs the catalog-level validation for IDs, references, variants and duplicate URLs;
- includes drafts in validation;
- returns all records, published records, archived records and issues.

An invalid draft produces an editorial error but does not by itself block the public catalog.

### 6. Public generation

`loadPublicCatalog()`:

- discovers and reads all files;
- treats read and parse errors as fatal: no public output is produced;
- ignores files whose `status` is `draft` after parsing;
- validates every remaining `published` and `archived` record;
- blocks the whole output if any public record is invalid;
- delegates to `toPublicCatalog()` for the final publication gate;
- returns published and archived records separately.

Because `toPublicCatalog()` already filters drafts and validates visible records, the loader reuses it rather than duplicating the logic.

### 7. Public references

A published record that references a draft record will cause `validateCatalog()` to report an unknown reference, which blocks public generation. This prevents broken public links: a published variant cannot point to a draft parent, and a published record cannot list a draft in `related`.

A published variant must also have a **published parent**. A draft variant may reference a draft or archived parent without blocking public output, because the draft variant itself is excluded from the public catalog.

A published record may still reference an archived record because archived records are part of the public catalog result, even if they are rendered differently. Whether archived records should be linkable from published pages is left as an open UI/policy question.

### 8. Error mapping

When `loadPublicCatalog()` maps issues returned by `toPublicCatalog()`, it attempts to attribute cross-record errors to the source file of the record mentioned in the issue path. Per-record errors continue to be mapped by their array index. This makes diagnostics point to the file responsible for a broken reference rather than to a generic `(public)` placeholder.

### 8. CLI commands

Two npm scripts run the pipeline from the project root:

- `npm run catalog:editorial` — validate every record.
- `npm run catalog:public` — validate the public catalog.

They are implemented as TypeScript scripts executed with `tsx`, so no separate build step is needed and the existing TypeScript configuration remains authoritative.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| Subdirectories by category | Categories are many-to-many and can change; subdirectories would create ambiguity. |
| Separate `draft/` and `published/` folders | Publishing would require moving files; status field is safer. |
| A single `catalog.json` file | Larger diffs, harder concurrent editing, no per-file history. |
| Public output with drafts filtered later | Drafts must never be serialised into the public dataset. |
| Silent skipping of unreadable files | Could hide data loss or corruption; fail closed instead. |
| Writing a custom ESM loader for Node | More infrastructure than adding a focused dev tool. |

## Consequences

- `data/records/` is the canonical editorial directory; code lives in `src/data/pipeline/`.
- The pipeline is independent of Astro and can be consumed by a thin facade later.
- Tests use a fake reader, so filesystem permissions do not affect determinism.
- Adding a real record is a data change, not a code change.
- `tsx` is added as a dev dependency to run TypeScript scripts without a build step.

## Implementation map

- `data/records/` — canonical record files.
- `data/records/README.md` — editorial rules for contributors.
- `src/data/pipeline/types.ts` — pipeline contracts.
- `src/data/pipeline/reader.ts` — Node.js filesystem reader.
- `src/data/pipeline/discovery.ts` — record discovery.
- `src/data/pipeline/load.ts` — editorial and public loading.
- `src/data/pipeline/index.ts` — public facade.
- `scripts/validate-editorial.ts` — CLI for editorial validation.
- `scripts/validate-public.ts` — CLI for public catalog validation.
- `test/pipeline/` — unit and integration tests for discovery and loading.

## Open questions

- Should archived records have public URLs or only be listed in a separate archive view?
- Should a published record be allowed to reference an archived record in the UI?
- What is the redirect/migration policy if an ID ever needs to change?
- Should the public catalog be written to a JSON snapshot during the Astro build, or generated on demand?

## Amendments

- **2026-11-23 — Mission 006.1:** a published variant must have a published parent. Draft variants may reference draft or archived parents. `loadPublicCatalog()` maps cross-record errors to the source file of the responsible record when possible.
