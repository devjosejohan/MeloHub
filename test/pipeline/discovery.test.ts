import { describe, expect, it } from "vitest";
import { discoverRecords } from "../../src/data/pipeline/discovery";
import type { FileSystemReader } from "../../src/data/pipeline/types";
import { createFakeReader } from "./reader.mock";

describe("discovery", () => {
  it("rejects a non-existent directory", async () => {
    const reader: FileSystemReader = {
      readDir: async () => {
        throw new Error("ENOENT");
      },
      readFile: async () => "",
    };
    await expect(discoverRecords(reader, "data/records")).rejects.toThrow("ENOENT");
  });

  it("returns an empty list for an empty directory", async () => {
    const reader = createFakeReader({});
    const result = await discoverRecords(reader, "data/other");
    expect(result.files).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.ignored).toEqual([]);
  });

  it("discovers and sorts JSON files deterministically", async () => {
    const reader = createFakeReader({
      "data/records/zebra.json": "{}",
      "data/records/alpha.json": "{}",
      "data/records/mid.json": "{}",
    });
    const result = await discoverRecords(reader, "data/records");
    expect(result.files.map((file) => file.expectedId)).toEqual(["alpha", "mid", "zebra"]);
    expect(result.issues).toEqual([]);
  });

  it("ignores non-JSON and hidden files", async () => {
    const reader = createFakeReader({
      "data/records/audiomass.json": "{}",
      "data/records/README.md": "# readme",
      "data/records/.hidden.json": "{}",
    });
    const result = await discoverRecords(reader, "data/records");
    expect(result.files.map((file) => file.expectedId)).toEqual(["audiomass"]);
    expect(result.ignored).toContain("README.md");
    expect(result.ignored).toContain(".hidden.json");
  });

  it("reports unexpected directories", async () => {
    const reader = createFakeReader({
      "data/records/nested/foobar.json": "{}",
    });
    const result = await discoverRecords(reader, "data/records");
    expect(result.files).toEqual([]);
    expect(result.issues.some((issue) => issue.message.includes("unexpected directory"))).toBe(
      true,
    );
  });

  it("reports invalid filenames", async () => {
    const reader = createFakeReader({
      "data/records/UPPER.json": "{}",
      "data/records/two--hyphens.json": "{}",
      "data/records/valid.json": "{}",
    });
    const result = await discoverRecords(reader, "data/records");
    expect(result.files.map((file) => file.expectedId)).toEqual(["valid"]);
    expect(result.issues.length).toBe(2);
  });
});
