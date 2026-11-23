import { describe, expect, it } from "vitest";
import type { CatalogRecord } from "../../src/data/schema/record";
import {
  toPublicCatalog,
  validateCatalog,
} from "../../src/data/validation/catalog-validation";
import {
  audiomass,
  clone,
  fixtureCatalog,
  foobar2000,
  foobar2000Mobile,
  musicolet,
} from "../fixtures/records";

const TODAY = "2026-11-23";
const options = { today: TODAY };

function withIdentity(base: CatalogRecord, id: string, parent?: string): CatalogRecord {
  const copy = clone(base);
  copy.id = id;
  copy.title = id;
  copy.links = { ...copy.links, official: `https://example.com/${id}` };
  delete copy.searchTerms;
  if (parent) {
    copy.variantOf = parent;
  } else {
    delete copy.variantOf;
  }
  return copy;
}

describe("catalog validation — the five validation cases", () => {
  it("accepts the full fixture catalog", () => {
    const result = validateCatalog(fixtureCatalog, options);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.published).toHaveLength(4);
    expect(result.published.map((record) => record.id)).not.toContain("musicolet");
    expect(result.published.map((record) => record.id)).not.toContain("vital");
    expect(result.records).toHaveLength(6);
  });

  it("keeps foobar2000 desktop and mobile as one variant family", () => {
    const result = validateCatalog([foobar2000, foobar2000Mobile], options);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("keeps Musicolet as a draft with unresolved licensing", () => {
    const result = validateCatalog([musicolet], options);
    expect(result.ok).toBe(true);
    expect(result.published).toEqual([]);
    expect(musicolet.licensing).toBeUndefined();
  });
});

describe("catalog validation — identity and references", () => {
  it("rejects duplicate record ids", () => {
    const duplicate = clone(audiomass);
    const result = validateCatalog([audiomass, duplicate], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("duplicate record id"))).toBe(true);
  });

  it("rejects an unknown category", () => {
    const invalid = clone(audiomass);
    invalid.categories = ["audio-nope"];
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown category"))).toBe(true);
  });

  it("rejects a platform outside the primary taxonomy", () => {
    const invalid = clone(audiomass);
    invalid.platforms = ["freebsd"];
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown platform"))).toBe(true);
  });

  it("rejects an unknown tag", () => {
    const invalid = clone(audiomass);
    invalid.tags = ["nope"];
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown tag"))).toBe(true);
  });

  it("rejects an unknown channel platform", () => {
    const invalid = clone(audiomass);
    invalid.channels![0]!.platform = "amiga";
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path.endsWith("channels[0].platform"))).toBe(true);
  });

  it("rejects an unknown related record", () => {
    const invalid = clone(audiomass);
    invalid.related = ["does-not-exist"];
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown related record"))).toBe(
      true,
    );
  });

  it("rejects a self-reference in related", () => {
    const invalid = clone(audiomass);
    invalid.related = ["audiomass"];
    const result = validateCatalog([invalid], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => /reference/i.test(issue.message))).toBe(true);
  });
});

describe("catalog validation — variants", () => {
  it("rejects a variant whose parent does not exist", () => {
    const orphan = withIdentity(audiomass, "orphan", "missing-parent");
    const result = validateCatalog([orphan], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown parent record"))).toBe(
      true,
    );
  });

  it("rejects a variant cycle", () => {
    const a = withIdentity(audiomass, "cycle-a", "cycle-b");
    const b = withIdentity(audiomass, "cycle-b", "cycle-a");
    const result = validateCatalog([a, b], options);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => /cycle|depth/.test(issue.message)),
    ).toBe(true);
  });

  it("rejects variant depth beyond one level", () => {
    const root = withIdentity(audiomass, "depth-root");
    const child = withIdentity(audiomass, "depth-child", "depth-root");
    const grandchild = withIdentity(audiomass, "depth-grandchild", "depth-child");
    const result = validateCatalog([root, child, grandchild], options);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("depth"))).toBe(true);
  });

  it("rejects a duplicate official URL across unrelated products", () => {
    const copy = withIdentity(audiomass, "audiomass-copy");
    copy.links.official = audiomass.links.official;
    const result = validateCatalog([audiomass, copy], options);
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.message.includes("unrelated product")),
    ).toBe(true);
  });

  it("allows a duplicate official URL inside the same variant family", () => {
    const result = validateCatalog([foobar2000, foobar2000Mobile], options);
    expect(result.issues).toEqual([]);
  });
});

describe("publication gate", () => {
  it("excludes drafts from public output", () => {
    const result = toPublicCatalog([audiomass, musicolet], options);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.published.map((record) => record.id)).toEqual(["audiomass"]);
    expect(result.catalog.published.some((record) => record.id === "musicolet")).toBe(false);
  });

  it("blocks output when a published record is invalid", () => {
    const invalid = clone(musicolet);
    invalid.status = "published";
    const result = toPublicCatalog([audiomass, invalid], options);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path.includes("licensing"))).toBe(true);
  });

  it("does not let an invalid draft block publication", () => {
    const invalidDraft = clone(musicolet);
    invalidDraft.summary = "Too short";

    const editorial = validateCatalog([audiomass, invalidDraft], options);
    expect(editorial.ok).toBe(false);
    expect(
      editorial.issues.some((issue) => issue.path.endsWith("summary")),
    ).toBe(true);

    const result = toPublicCatalog([audiomass, invalidDraft], options);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.published.map((record) => record.id)).toEqual(["audiomass"]);
  });

  it("keeps Vital as a draft and out of the public catalog", () => {
    const result = toPublicCatalog(fixtureCatalog, options);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.published.map((record) => record.id)).not.toContain("vital");
  });

  it("returns archived records separately from published records", () => {
    const archived = clone(audiomass);
    archived.status = "archived";
    archived.archive = { at: TODAY, reason: "Project discontinued" };

    const result = toPublicCatalog([archived], options);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.catalog.published).toEqual([]);
    expect(result.catalog.archived.map((record) => record.id)).toEqual(["audiomass"]);
  });

  it("rejects a non-array catalog", () => {
    const result = toPublicCatalog({ records: [] }, options);
    expect(result.ok).toBe(false);
  });
});
