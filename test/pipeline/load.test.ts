import { describe, expect, it } from "vitest";
import type { CatalogRecord } from "../../src/data/schema/record";
import { loadEditorialCatalog, loadPublicCatalog } from "../../src/data/pipeline/load";
import type { FileSystemReader } from "../../src/data/pipeline/types";
import { audiomass, clone, musicolet } from "../fixtures/records";
import { createFakeReader } from "./reader.mock";

const TODAY = "2026-11-23";

function makeRecord(id: string, overrides: Partial<CatalogRecord> = {}): CatalogRecord {
  const base = clone(audiomass);
  base.id = id;
  base.title = id;
  base.searchTerms = undefined;
  base.related = undefined;
  base.variantOf = undefined;
  base.links = { ...base.links, official: `https://example.com/${id}` };
  return { ...base, ...overrides };
}

function toFiles(records: CatalogRecord[]): Record<string, string> {
  const files: Record<string, string> = {};
  for (const record of records) {
    files[`data/records/${record.id}.json`] = JSON.stringify(record);
  }
  return files;
}

describe("loadEditorialCatalog", () => {
  it("loads a valid catalog and reports no issues", async () => {
    const files = toFiles([makeRecord("alpha"), makeRecord("beta")]);
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.published).toHaveLength(2);
  });

  it("validates all records, including drafts", async () => {
    const draft = clone(musicolet);
    const files = toFiles([makeRecord("alpha"), draft]);
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.records.map((r) => r.id)).toContain("musicolet");
    expect(result.published.map((r) => r.id)).toEqual(["alpha"]);
  });

  it("reports an invalid draft as an editorial error", async () => {
    const invalidDraft = clone(musicolet);
    invalidDraft.summary = "Too short";
    const files = toFiles([makeRecord("alpha"), invalidDraft]);
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.sourcePath.includes("musicolet"))).toBe(true);
  });

  it("reports a JSON parse error with the file path", async () => {
    const files = {
      "data/records/alpha.json": JSON.stringify(makeRecord("alpha")),
      "data/records/broken.json": "{ not json",
    };
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.sourcePath.includes("broken") && issue.stage === "parse")).toBe(true);
  });

  it("reports a non-object JSON value", async () => {
    const files = { "data/records/alpha.json": "[]" };
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("JSON object");
  });

  it("reports a filename/id mismatch", async () => {
    const files = { "data/records/alpha.json": JSON.stringify(makeRecord("beta")) };
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.stage === "filename")).toBe(true);
  });

  it("reports unreadable files", async () => {
    const baseReader = createFakeReader({
      "data/records/alpha.json": JSON.stringify(makeRecord("alpha")),
      "data/records/unreadable.json": "{}",
    });
    const reader: FileSystemReader = {
      ...baseReader,
      readFile: async (path) => {
        if (path.includes("unreadable")) {
          throw new Error("EACCES");
        }
        return baseReader.readFile(path);
      },
    };
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader, today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.sourcePath.includes("unreadable") && issue.stage === "read")).toBe(true);
  });

  it("detects duplicate ids across files", async () => {
    const files = {
      "data/records/alpha.json": JSON.stringify(makeRecord("alpha")),
      "data/records/alpha-copy.json": JSON.stringify(makeRecord("alpha")),
    };
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("duplicate record id"))).toBe(true);
  });

  it("detects unknown variant references", async () => {
    const files = toFiles([makeRecord("child", { variantOf: "missing-parent" })]);
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown parent record"))).toBe(true);
  });

  it("detects unknown related references", async () => {
    const files = toFiles([makeRecord("alpha", { related: ["missing"] })]);
    const result = await loadEditorialCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown related record"))).toBe(true);
  });
});

describe("loadPublicCatalog", () => {
  it("excludes drafts from the public output", async () => {
    const files = toFiles([makeRecord("alpha"), clone(musicolet)]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id)).toEqual(["alpha"]);
    expect(result.catalog.published.some((r) => r.id === "musicolet")).toBe(false);
  });

  it("keeps published records when they are valid", async () => {
    const files = toFiles([makeRecord("alpha"), makeRecord("beta")]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("blocks output when a published record is invalid", async () => {
    const invalid = makeRecord("alpha");
    delete invalid.licensing;
    const files = toFiles([invalid, makeRecord("beta")]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.catalog.published).toEqual([]);
  });

  it("blocks output when an archived record is invalid", async () => {
    const archived = makeRecord("alpha", { status: "archived" });
    const files = toFiles([archived, makeRecord("beta")]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.catalog.published).toEqual([]);
  });

  it("returns archived records separately", async () => {
    const archived = makeRecord("old", { status: "archived", archive: { at: TODAY, reason: "Discontinued" } });
    const files = toFiles([makeRecord("alpha"), archived]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id)).toEqual(["alpha"]);
    expect(result.catalog.archived.map((r) => r.id)).toEqual(["old"]);
  });

  it("blocks output on parse errors", async () => {
    const files = {
      "data/records/alpha.json": JSON.stringify(makeRecord("alpha")),
      "data/records/broken.json": "{ not json",
    };
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.stage).toBe("parse");
  });

  it("does not block output because of an invalid draft", async () => {
    const invalidDraft = clone(musicolet);
    invalidDraft.summary = "Too short";
    const files = toFiles([makeRecord("alpha"), invalidDraft]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id)).toEqual(["alpha"]);
  });

  it("blocks output when a published variant points to a draft parent", async () => {
    const parent = clone(musicolet);
    const child = makeRecord("child", { variantOf: "musicolet" });
    const files = toFiles([parent, child]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown parent record"))).toBe(true);
  });

  it("blocks output when a published record relates to a draft", async () => {
    const draft = clone(musicolet);
    const published = makeRecord("alpha", { related: ["musicolet"] });
    const files = toFiles([draft, published]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown related record"))).toBe(true);
  });

  it("allows a published variant with a published parent", async () => {
    const parent = makeRecord("parent");
    const child = makeRecord("child", { variantOf: "parent" });
    const files = toFiles([parent, child]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id).sort()).toEqual(["child", "parent"]);
  });

  it("blocks output when a published variant points to an archived parent", async () => {
    const parent = makeRecord("parent", { status: "archived", archive: { at: TODAY, reason: "Retired" } });
    const child = makeRecord("child", { variantOf: "parent" });
    const files = toFiles([parent, child]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("published variant requires a published parent"))).toBe(true);
    expect(result.issues[0]?.sourcePath).toBe("data/records/child.json");
  });

  it("does not block output when a draft variant points to an archived parent", async () => {
    const parent = makeRecord("parent", { status: "archived", archive: { at: TODAY, reason: "Retired" } });
    const child = makeRecord("child", { status: "draft", variantOf: "parent" });
    const files = toFiles([parent, child]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.archived.map((r) => r.id)).toEqual(["parent"]);
    expect(result.catalog.published).toEqual([]);
    expect(result.catalog.published.some((r) => r.id === "child")).toBe(false);
  });

  it("keeps Vital out of the public catalog", async () => {
    const vital = clone((await import("../fixtures/records")).vital);
    const files = toFiles([makeRecord("alpha"), vital]);
    const result = await loadPublicCatalog({ recordsDir: "data/records", reader: createFakeReader(files), today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.catalog.published.map((r) => r.id)).not.toContain("vital");
  });
});
