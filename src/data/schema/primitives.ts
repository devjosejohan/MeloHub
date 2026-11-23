import { z } from "zod";

/** Lowercase kebab-case identifier used for record ids and registry ids. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SLUG_PATTERN, "must be lowercase kebab-case (a-z, 0-9, single hyphens)");

/** Absolute https URL. Shortener and liveness checks are build-time concerns. */
export const httpsUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", "must use https");

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True only for real calendar dates in YYYY-MM-DD form. */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z
  .string()
  .refine(isCalendarDate, "must be a valid calendar date (YYYY-MM-DD)");

/** Today in UTC, used as the default reference date for freshness rules. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True when the value is strictly after the reference date. ISO dates compare lexically. */
export function isAfter(value: string, reference: string): boolean {
  return value > reference;
}

const INSTALLER_FILE_PATTERN =
  /\.(?:exe|msi|msix|dmg|pkg|apk|ipa|appimage|deb|rpm|zip|tgz|tar|gz)$/i;

/**
 * Heuristic guard against version-specific installer URLs, which break on every release.
 * Acquisition links must point at a stable page instead.
 */
export function looksLikeInstallerFile(value: string): boolean {
  try {
    const segments = new URL(value).pathname.split("/").filter(Boolean);
    const last = segments.at(-1) ?? "";
    return INSTALLER_FILE_PATTERN.test(last);
  } catch {
    return false;
  }
}

/** Plain text fields must not carry markup that would render as HTML. */
export function isPlainText(value: string): boolean {
  return !/[<>]/.test(value);
}
