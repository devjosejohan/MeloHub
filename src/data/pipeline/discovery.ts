import { SLUG_PATTERN } from "../schema/primitives";
import type { DirEntry, DiscoveredRecord, DiscoveryResult, FileSystemReader, PipelineIssue } from "./types";

function toSourcePath(dir: string, name: string): string {
  const separator = dir.endsWith("/") || dir.endsWith("\\") ? "" : "/";
  return `${dir}${separator}${name}`.replace(/\\/g, "/");
}

function isIgnoredEntry(entry: DirEntry): boolean {
  return entry.name.startsWith(".") || !entry.name.endsWith(".json");
}

/**
 * Discovers record files in a single directory.
 *
 * - Only `.json` files are considered records.
 * - Hidden files and non-JSON files are ignored (and reported as ignored).
 * - Subdirectories are reported as issues because the layout must remain flat.
 * - Files are returned sorted by source path for deterministic validation order.
 */
export async function discoverRecords(
  reader: FileSystemReader,
  recordsDir: string,
): Promise<DiscoveryResult> {
  const issues: PipelineIssue[] = [];
  const ignored: string[] = [];
  const files: DiscoveredRecord[] = [];

  const entries = await reader.readDir(recordsDir);

  for (const entry of entries) {
    if (entry.isDirectory) {
      issues.push({
        sourcePath: toSourcePath(recordsDir, entry.name),
        stage: "discovery",
        message: "unexpected directory in records folder",
      });
      continue;
    }

    if (isIgnoredEntry(entry)) {
      ignored.push(entry.name);
      continue;
    }

    const expectedId = entry.name.slice(0, -".json".length);
    if (!SLUG_PATTERN.test(expectedId)) {
      issues.push({
        sourcePath: toSourcePath(recordsDir, entry.name),
        stage: "discovery",
        message: `filename is not a valid record id: ${entry.name}`,
      });
      continue;
    }

    files.push({
      sourcePath: toSourcePath(recordsDir, entry.name),
      expectedId,
    });
  }

  files.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

  return { files, ignored, issues };
}
