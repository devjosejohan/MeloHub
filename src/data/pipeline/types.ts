import type { CatalogRecord, PublicCatalog } from "../types/index";

export type PipelineStage =
  | "discovery"
  | "read"
  | "parse"
  | "filename"
  | "record"
  | "catalog"
  | "public";

export interface PipelineIssue {
  /** Path of the source file, or '(catalog)'/(public) for cross-record issues. */
  sourcePath: string;
  stage: PipelineStage;
  message: string;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * Minimal filesystem abstraction. It keeps the pipeline testable without real
 * permissions and makes I/O failures explicit and deterministic.
 */
export interface FileSystemReader {
  readDir(dir: string): Promise<DirEntry[]>;
  readFile(path: string): Promise<string>;
}

export interface DiscoveredRecord {
  sourcePath: string;
  expectedId: string;
}

export interface DiscoveryResult {
  files: DiscoveredRecord[];
  ignored: string[];
  issues: PipelineIssue[];
}

export interface LoadOptions {
  /** Directory that contains `<id>.json` files. Defaults to `data/records`. */
  recordsDir?: string;
  /** Reference date for freshness rules. Defaults to UTC today. */
  today?: string;
  /** Reader implementation. Defaults to the Node.js filesystem reader. */
  reader?: FileSystemReader;
}

export interface EditorialCatalogResult {
  ok: boolean;
  records: CatalogRecord[];
  published: CatalogRecord[];
  archived: CatalogRecord[];
  issues: PipelineIssue[];
}

export interface PublicCatalogResult {
  ok: boolean;
  catalog: PublicCatalog;
  issues: PipelineIssue[];
}
