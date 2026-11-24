# MeloHub editorial records

This directory holds the canonical record files for the MeloHub catalog.

## Rules

- One file per record: `<id>.json`.
- The filename must match the `id` field inside the file exactly.
- IDs are stable kebab-case slugs. Once used, they are not reused for another product.
- Records are **not** organised into subdirectories.
- Editorial status is controlled by the `status` field, not by file location.
  - `draft` — work in progress, not public.
  - `published` — verified and approved for public display.
  - `archived` — retired, kept for history.

## Adding a new record

1. Choose a stable ID, e.g. `my-audio-player`.
2. Create `data/records/my-audio-player.json`.
3. Fill in the JSON according to the record schema.
4. Start with `status: "draft"`.
5. Run the editorial validation and fix any errors.
6. Add evidence, reviewer and verification date only after human review.
7. Change `status` to `"published"` as part of an approved editorial commit.

## Validation commands

```bash
# Validate every record, including drafts
npm run catalog:editorial

# Validate the public catalog (excludes drafts, fails on any invalid public record)
npm run catalog:public
```

See `docs/decisions/ADR-001-data-model.md` and `docs/decisions/ADR-002-catalog-pipeline.md` for the data model and pipeline rules.
