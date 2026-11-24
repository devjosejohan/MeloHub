import { validateCatalog, toPublicCatalog } from "../validation/catalog-validation";
import { validateRecord } from "../validation/record-validation";
import type { CatalogRecord } from "../schema/record";
import { nodeFileSystemReader } from "./reader";
import type {
  DiscoveryResult,
  EditorialCatalogResult,
  FileSystemReader,
  LoadOptions,
  PipelineIssue,
  PublicCatalogResult,
} from "./types";
import { discoverRecords } from "./discovery";

const DEFAULT_RECORDS_DIR = "data/records";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(sourcePath: string, stage: PipelineIssue["stage"], message: string): PipelineIssue {
  return { sourcePath, stage, message };
}

function formatPublicMessage(publicIssue: { path: string; message: string }): string {
  return publicIssue.path ? `${publicIssue.path}: ${publicIssue.message}` : publicIssue.message;
}

function mapCatalogIssue(
  issue: { path: string; message: string },
  idToSource: ReadonlyMap<string, string>,
): PipelineIssue {
  const firstSegment = issue.path.split(".")[0] ?? "";
  const id = firstSegment.replace(/^\[(\d+)\]$/, "$1");
  const sourcePath = idToSource.get(id) ?? "(catalog)";
  return {
    sourcePath,
    stage: "catalog",
    message: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
  };
}

async function discover(
  reader: FileSystemReader,
  recordsDir: string,
): Promise<DiscoveryResult> {
  try {
    return await discoverRecords(reader, recordsDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      files: [],
      ignored: [],
      issues: [issue(recordsDir, "discovery", message)],
    };
  }
}

/**
 * Loads and validates every record, including drafts.
 *
 * This is the editorial pass: it must surface every structural, semantic and
 * cross-record problem so that no mistake is hidden before publication.
 */
export async function loadEditorialCatalog(
  options: LoadOptions = {},
): Promise<EditorialCatalogResult> {
  const recordsDir = options.recordsDir ?? DEFAULT_RECORDS_DIR;
  const reader = options.reader ?? nodeFileSystemReader;
  const today = options.today;

  const { files, issues: discoveryIssues } = await discover(reader, recordsDir);
  const issues: PipelineIssue[] = [...discoveryIssues];
  const records: CatalogRecord[] = [];
  const idToSource = new Map<string, string>();

  for (const file of files) {
    let text: string;
    try {
      text = await reader.readFile(file.sourcePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(issue(file.sourcePath, "read", message));
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(issue(file.sourcePath, "parse", message));
      continue;
    }

    if (!isObject(parsed)) {
      issues.push(issue(file.sourcePath, "parse", "record must be a JSON object"));
      continue;
    }

    const recordId = parsed.id;
    if (recordId !== file.expectedId) {
      issues.push(
        issue(
          file.sourcePath,
          "filename",
          `filename id mismatch: expected "${file.expectedId}", found "${String(recordId)}"`,
        ),
      );
    }

    const result = validateRecord(parsed, { today });
    if (!result.ok) {
      for (const recordIssue of result.issues) {
        const prefix = recordIssue.path && recordIssue.path !== "(root)" ? `${recordIssue.path}: ` : "";
        issues.push(issue(file.sourcePath, "record", `${prefix}${recordIssue.message}`));
      }
      continue;
    }

    const record = result.record;
    if (!record) {
      continue;
    }
    records.push(record);
    idToSource.set(record.id, file.sourcePath);
  }

  const catalogResult = validateCatalog(records, { today });
  for (const catalogIssue of catalogResult.issues) {
    issues.push(mapCatalogIssue(catalogIssue, idToSource));
  }

  return {
    ok: issues.length === 0,
    records: catalogResult.records,
    published: catalogResult.published,
    archived: catalogResult.archived,
    issues,
  };
}

/**
 * Generates the public catalog.
 *
 * - Drafts are ignored after parsing.
 * - Read/parse errors are fatal: no public output is produced.
 * - Any invalid published or archived record blocks the whole output.
 * - No partial catalog is ever returned.
 */
export async function loadPublicCatalog(
  options: LoadOptions = {},
): Promise<PublicCatalogResult> {
  const recordsDir = options.recordsDir ?? DEFAULT_RECORDS_DIR;
  const reader = options.reader ?? nodeFileSystemReader;
  const today = options.today;

  const { files, issues: discoveryIssues } = await discover(reader, recordsDir);
  if (discoveryIssues.length > 0) {
    return { ok: false, catalog: { published: [], archived: [] }, issues: discoveryIssues };
  }

  const visibleObjects: unknown[] = [];
  const visibleSources: string[] = [];
  const idToSource = new Map<string, string>();
  const issues: PipelineIssue[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = await reader.readFile(file.sourcePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, catalog: { published: [], archived: [] }, issues: [issue(file.sourcePath, "read", message)] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, catalog: { published: [], archived: [] }, issues: [issue(file.sourcePath, "parse", message)] };
    }

    if (!isObject(parsed)) {
      return {
        ok: false,
        catalog: { published: [], archived: [] },
        issues: [issue(file.sourcePath, "parse", "record must be a JSON object")],
      };
    }

    if (parsed.status === "draft") {
      continue;
    }

    if (parsed.id !== file.expectedId) {
      issues.push(
        issue(
          file.sourcePath,
          "filename",
          `filename id mismatch: expected "${file.expectedId}", found "${String(parsed.id)}"`,
        ),
      );
      continue;
    }

    visibleObjects.push(parsed);
    visibleSources.push(file.sourcePath);
    idToSource.set(parsed.id as string, file.sourcePath);
  }

  if (issues.length > 0) {
    return { ok: false, catalog: { published: [], archived: [] }, issues };
  }

  const catalogResult = toPublicCatalog(visibleObjects, { today });
  if (!catalogResult.ok) {
    const mapped: PipelineIssue[] = catalogResult.issues.map((publicIssue) => {
      const indexMatch = publicIssue.path.match(/^\[(\d+)\]/);
      if (indexMatch) {
        const sourcePath = visibleSources[Number(indexMatch[1])] ?? "(public)";
        return issue(sourcePath, "public", formatPublicMessage(publicIssue));
      }
      const id = publicIssue.path.split(".")[0] ?? "";
      const sourcePath = idToSource.get(id) ?? "(public)";
      return issue(sourcePath, "public", formatPublicMessage(publicIssue));
    });
    return { ok: false, catalog: { published: [], archived: [] }, issues: mapped };
  }

  return { ok: true, catalog: catalogResult.catalog, issues: [] };
}
