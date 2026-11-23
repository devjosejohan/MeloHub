# ADR-001 — Catalog data model

- **Status:** Accepted
- **Date:** 2026-11-23
- **Scope:** Record schema, registries, validation and publication rules
- **Out of scope:** Astro integration, page rendering, search indexing, UI

## Context

MeloHub is a curated directory. Every listing has to be accurate, sourced and safe to publish, and the catalog has to stay editable by a human through Git without a database.

The model therefore had to:

- describe software records without pretending to cover products or news yet;
- keep factual claims (licence, price model, platforms, distribution) separate from editorial prose;
- make it impossible for an unfinished record to appear in public output;
- be usable without a framework, so Astro can consume it later;
- stay testable without network access or the real current date.

Earlier proposals (Missions 003 and 003.1) were reviewed and folded into the model below. Where this ADR differs from them, the difference is stated explicitly.

## Decision

### 1. Record identity and shape

- A record is one JSON object with a kebab-case `id` and a `kind`. Only `software` exists today; other kinds require a new decision.
- `form` is `application`, `plugin`, `web-app` or `library`. **`utility` was removed**: "utility" is a category judgement, not a distribution or integration form, and it duplicated the `general-utility` category.
- Records are stored one per file, validated as an array, and referenced by `id`. Cross-record facts (variants, relations, URL uniqueness) are catalog-level rules, not field rules.

### 2. Plugin formats

- `formats[]` holds plugin binary formats only: `vst2`, `vst3`, `au`, `auv3`, `aax`, `clap`, `lv2`.
- **`standalone` was removed**: a standalone build is an application form, not a plugin format. Codecs such as MP3 or FLAC are never valid here; they belong to audio files, not to software distribution.
- `formats[]` is required when `form === "plugin"` and forbidden otherwise, so a plugin cannot be listed without saying what it installs into, and an application cannot borrow plugin vocabulary.

### 3. Distribution channels

- `channels[]` describes acquisition routes, not files. Each entry has `type`, a stable `url`, and optional `platform`, `format` and `note`.
- `type` is closed: `direct-download`, `store`, `repository-release`, `package-manager`, `package-registry`, `web-app`, `source-code`.
- `format` uses a closed package vocabulary (`exe-installer`, `msi`, `dmg`, `pkg`, `apk`, `ipa`, `flatpak`, `snap`, `appimage`, `deb`, `rpm`, `distro-package`, `portable-archive`, `source-archive`, `other`). **`other` requires a note**, so an unusual format is described rather than hidden behind a label.
- `format` is optional: if the package type was not verified, the field stays absent instead of being guessed.
- URLs must be stable acquisition pages. Version-specific artefacts (`…/downloads/foobar2000_v2.26.3.exe`) are rejected by a heuristic guard because they break on the next release.

### 4. Pricing

- `pricing.models[]` is a closed vocabulary: `free`, `freemium`, `paid`, `subscription`, `donationware`. No prices or currencies are stored; vendors change them faster than a static catalog can follow.
- `inAppPurchases` and `trial` are optional booleans, not models. `trial` is a sales mechanic, not a price model.
- Unknown facts stay omitted. The schema never defaults a boolean to `false`, because "no in-app purchases" and "nobody checked" are different claims.
- `free` cannot be combined with `freemium`, `paid` or `subscription`. `freemium` requires `limitation`; paid, subscription and freemium require `pricingUrl`.

### 5. Licensing

- `licensing.model` describes the **source** licensing: `open-source`, `source-available`, `proprietary`, `public-domain`.
- `spdx`, `name`, `url` and `note` carry the detail. `note` must explain when distributed binaries, bundled assets or presets follow different terms than the source.
- Licensing may be **absent on a draft** so unresolved questions can be recorded without inventing an answer. It is **mandatory to publish**, and an unresolved licence blocks publication.
- Missing licensing is never read as `proprietary`: absence means "not established".
- `open-source` requires a valid SPDX identifier and a URL to the licence text. Repository badges are not evidence; the licence file itself is.

### 6. Variants

- `variantOf` points at a parent record; depth is limited to one level.
- Split a record into variants when licensing, pricing or platform distribution materially differ (desktop vs mobile builds with separate licences). Do not split on architecture, package format or store listing.
- Official URLs may repeat **inside a variant family** — foobar2000 desktop and mobile legitimately share `https://www.foobar2000.org` — but not across unrelated products.

### 7. Platforms and registries

- Platform ids are a registry, not a schema enum: `windows`, `macos`, `linux`, `android`, `ios`, `tvos`, `web`. Compatibility layers (Proton, Wine, Rosetta) are not platforms, and secondary systems such as BSD or Haiku are out of scope until the taxonomy is revisited.
- Categories and tags are registries too. Adding a category is a data change, not a code change. Records reference registry ids, and the catalog pass proves every reference resolves.

### 8. Verification and publication

- `verification` records status (`verified`, `needs-review`, `deprecated`, `disputed`), evidence, reviewer, date and an optional note.
- Published records need verification with at least one `official-site` or `store-listing` evidence item and **must have `verification.status === "verified"`**. `needs-review` and `disputed` are valid on drafts only.
- `verified` additionally needs a reviewer and a date. Evidence must support the specific claim, so a licence claim needs a licence source.
- A contradiction between sources sets `disputed` and requires `verification.note`. The schema cannot detect contradictions; it only refuses a disputed record without an explanation.
- Link liveness (404) is an editorial check, not a schema check: no build step performs network requests.

### 9. Publication gate and archive policy

- `status` is `draft`, `published` or `archived`.
- Drafts are filtered out **before** validation in the public path, so an unfinished record can neither leak into output nor block a deploy. The editorial pass still validates drafts, so mistakes surface early.
- Anything not a draft must validate completely, or no catalog is produced at all (fail closed).
- Archived records require `archive.at` and `archive.reason`, remain valid, and are returned separately from published records so they can be rendered differently or excluded later.

### 10. Determinism

- Date rules (no future `addedAt`, `updatedAt`, `archive.at`, `lastVerifiedAt` or `checkedAt`; `updatedAt >= addedAt`) compare against an injected `today`. Tests pass a fixed date; production defaults to UTC today.
- No test depends on the network, the filesystem clock or the machine locale.

## Rejected alternatives

| Alternative | Why not |
| --- | --- |
| `form: "utility"` | Duplicates category semantics; not a distribution form. |
| `formats: ["standalone"]` | A standalone build is an application, not a plugin format. |
| Storing prices and currencies | Stale within weeks; a `pricingUrl` is verifiable. |
| Defaulting `inAppPurchases: false` | Turns "unknown" into a factual claim. |
| Treating a missing licence as proprietary | Wrong for source-available and unreleased projects. |
| Unlimited variant nesting | Editorial complexity for no gain; one level covers real product families. |
| Global unique official URLs | Breaks legitimate product families with one site. |
| Free-form channel formats | Unverifiable strings; `other` plus a note is enough. |
| Validating drafts in the publication path | A single unfinished record would block every deploy. |
| Reading the system date inside the schema | Non-deterministic tests. |

## Consequences

- New vocabulary values (a category, a platform, a package format) may require a decision record and a schema change; this is deliberate friction.
- Records cannot express hardware, news or people yet. `kind` is the extension point.
- Link checking stays manual and is recorded as evidence with a date, not as a CI guarantee.
- The model is framework-agnostic TypeScript. Astro, search indexing and rendering consume it later and must not reshape it.

## Implementation map

- `src/data/schema/primitives.ts` — shared scalars, date and URL guards.
- `src/data/schema/{licensing,pricing,verification,channel,record}.ts` — record-level schemas and conditional rules.
- `src/data/schema/registry.ts`, `src/data/registries/*.json` — taxonomy data.
- `src/data/validation/record-validation.ts` — single-record validation.
- `src/data/validation/catalog-validation.ts` — cross-record rules, publication gate, archive split.
- `test/fixtures/records.ts` — temporary validation fixtures, not catalog content.

## Open questions

- Node version pin: local tooling runs Node 26.4.0; the project declares `>=24.0.0` and `.nvmrc` pins 24 LTS. Decide the supported range before CI exists.
- Where record files live once the catalog grows (`data/records/<id>.json`) and how the loader reads them.
- Whether archived records get their own URL or stay out of the public catalog entirely.

## Amendments

- **2026-11-23 — Mission 004.1:** published records must have `verification.status === "verified"`. `needs-review` and `disputed` are now restricted to drafts. Vital moved back to `draft` because its vendor-distributed plugin formats are not yet confirmed.
