import { categoryIds, platformIds, tagIds } from "../registries/index";
import type { CatalogRecord } from "../schema/record";
import type { ValidationIssue, ValidationOptions } from "./record-validation";
import { validateRecord } from "./record-validation";

export interface CatalogValidationResult {
  ok: boolean;
  records: CatalogRecord[];
  published: CatalogRecord[];
  archived: CatalogRecord[];
  issues: ValidationIssue[];
}

export interface PublicCatalog {
  published: CatalogRecord[];
  archived: CatalogRecord[];
}

export type PublicCatalogResult =
  | { ok: true; catalog: PublicCatalog }
  | { ok: false; issues: ValidationIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Treats a trailing slash as the same page; keeps query strings significant. */
function normaliseUrl(value: string): string {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

/**
 * Validates a whole catalog: every record individually, then the relationships between
 * records and registries. Drafts are validated too, so editorial mistakes surface early;
 * the publication gate in `toPublicCatalog` is what excludes them from output.
 */
export function validateCatalog(
  input: unknown,
  options: ValidationOptions = {},
): CatalogValidationResult {
  const issues: ValidationIssue[] = [];
  const records: CatalogRecord[] = [];

  if (!Array.isArray(input)) {
    return {
      ok: false,
      records: [],
      published: [],
      archived: [],
      issues: [{ path: "(root)", message: "catalog must be an array of records" }],
    };
  }

  input.forEach((raw, index) => {
    const result = validateRecord(raw, options);
    if (result.ok && result.record) {
      records.push(result.record);
    } else {
      for (const issue of result.issues) {
        issues.push({ path: `[${index}].${issue.path}`, message: issue.message });
      }
    }
  });

  const byId = new Map<string, CatalogRecord>();
  for (const record of records) {
    if (byId.has(record.id)) {
      issues.push({ path: record.id, message: `duplicate record id: ${record.id}` });
      continue;
    }
    byId.set(record.id, record);
  }

  for (const record of records) {
    for (const id of record.categories) {
      if (!categoryIds.has(id)) {
        issues.push({ path: `${record.id}.categories`, message: `unknown category: ${id}` });
      }
    }
    for (const id of record.platforms) {
      if (!platformIds.has(id)) {
        issues.push({ path: `${record.id}.platforms`, message: `unknown platform: ${id}` });
      }
    }
    record.tags?.forEach((id, index) => {
      if (!tagIds.has(id)) {
        issues.push({ path: `${record.id}.tags[${index}]`, message: `unknown tag: ${id}` });
      }
    });
    record.channels?.forEach((channel, index) => {
      if (channel.platform && !platformIds.has(channel.platform)) {
        issues.push({
          path: `${record.id}.channels[${index}].platform`,
          message: `unknown platform: ${channel.platform}`,
        });
      }
    });
  }

  for (const record of records) {
    if (!record.variantOf || record.variantOf === record.id) {
      continue;
    }
    const parent = byId.get(record.variantOf);
    if (!parent) {
      issues.push({
        path: `${record.id}.variantOf`,
        message: `unknown parent record: ${record.variantOf}`,
      });
      continue;
    }
    if (parent.variantOf) {
      issues.push({
        path: `${record.id}.variantOf`,
        message: "variant depth is limited to one level",
      });
    }
  }

  for (const record of records) {
    let current: CatalogRecord | undefined = record;
    const chain: string[] = [];
    while (current?.variantOf) {
      if (chain.includes(current.id)) {
        issues.push({ path: `${record.id}.variantOf`, message: "variant cycle detected" });
        break;
      }
      chain.push(current.id);
      current = byId.get(current.variantOf);
    }
  }

  for (const record of records) {
    record.related?.forEach((id) => {
      if (id === record.id) {
        issues.push({ path: `${record.id}.related`, message: "must not reference itself" });
      } else if (!byId.has(id)) {
        issues.push({ path: `${record.id}.related`, message: `unknown related record: ${id}` });
      }
    });
  }

  // Official URLs may repeat inside a variant family, never across unrelated products.
  const familyRoot = (record: CatalogRecord): string =>
    record.variantOf && byId.has(record.variantOf) ? record.variantOf : record.id;

  const groups = new Map<string, CatalogRecord[]>();
  for (const record of records) {
    const key = normaliseUrl(record.links.official);
    const group = groups.get(key);
    if (group) {
      group.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  for (const [url, group] of groups) {
    if (group.length < 2) {
      continue;
    }
    const roots = new Set(group.map(familyRoot));
    if (roots.size > 1) {
      for (const record of group) {
        issues.push({
          path: `${record.id}.links.official`,
          message: `official URL is shared with an unrelated product: ${url}`,
        });
      }
    }
  }

  const published = records.filter((record) => record.status === "published");
  const archived = records.filter((record) => record.status === "archived");

  return { ok: issues.length === 0, records, published, archived, issues };
}

/**
 * Publication gate. Drafts are excluded before anything is validated, so an unfinished
 * record can neither leak into output nor block a deploy. Everything else must be valid,
 * otherwise no catalog is returned at all.
 */
export function toPublicCatalog(
  input: unknown,
  options: ValidationOptions = {},
): PublicCatalogResult {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: "(root)", message: "catalog must be an array of records" }],
    };
  }

  const visible: unknown[] = [];
  const issues: ValidationIssue[] = [];

  input.forEach((record, index) => {
    if (!isObject(record)) {
      issues.push({ path: `[${index}]`, message: "record must be an object" });
      return;
    }
    if (record.status === "draft") {
      return;
    }
    visible.push(record);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const result = validateCatalog(visible, options);
  if (!result.ok) {
    return { ok: false, issues: result.issues };
  }

  return { ok: true, catalog: { published: result.published, archived: result.archived } };
}
