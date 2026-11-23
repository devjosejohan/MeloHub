import { z } from "zod";
import { todayISO } from "../schema/primitives";
import { createRecordSchema, type CatalogRecord } from "../schema/record";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationOptions {
  /** Reference date for freshness rules. Defaults to today in UTC; tests pass a fixed value. */
  today?: string;
}

export interface RecordValidationResult {
  ok: boolean;
  record?: CatalogRecord;
  issues: ValidationIssue[];
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Validates one record in isolation: structure, conditional rules and intra-record dates.
 * Cross-record integrity (ids, references, variants, duplicate URLs) lives in
 * `catalog-validation.ts`.
 */
export function validateRecord(
  input: unknown,
  options: ValidationOptions = {},
): RecordValidationResult {
  const today = options.today ?? todayISO();
  const result = createRecordSchema(today).safeParse(input);

  if (result.success) {
    return { ok: true, record: result.data, issues: [] };
  }

  return { ok: false, issues: toValidationIssues(result.error) };
}
