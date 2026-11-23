import { z } from "zod";
import { channelSchema } from "./channel";
import { licensingSchema } from "./licensing";
import { pricingSchema } from "./pricing";
import {
  httpsUrlSchema,
  isAfter,
  isPlainText,
  isoDateSchema,
  slugSchema,
  todayISO,
} from "./primitives";
import { verificationSchema } from "./verification";

export const recordStatuses = ["draft", "published", "archived"] as const;
export const recordKinds = ["software"] as const;
export const recordForms = ["application", "plugin", "web-app", "library"] as const;
export const pluginFormats = ["vst2", "vst3", "au", "auv3", "aax", "clap", "lv2"] as const;
export const offlineCapabilities = ["full", "partial", "none", "unknown"] as const;

export const recordStatusSchema = z.enum(recordStatuses);
export const recordKindSchema = z.enum(recordKinds);
export const recordFormSchema = z.enum(recordForms);
export const pluginFormatSchema = z.enum(pluginFormats);
export const offlineCapabilitySchema = z.enum(offlineCapabilities);

export type RecordStatus = (typeof recordStatuses)[number];
export type RecordKind = (typeof recordKinds)[number];
export type RecordForm = (typeof recordForms)[number];
export type PluginFormat = (typeof pluginFormats)[number];

export const linksSchema = z.strictObject({
  /** Canonical identity. May be shared inside one variant family. */
  official: httpsUrlSchema,
  repository: httpsUrlSchema.optional(),
  docs: httpsUrlSchema.optional(),
});

export const mediaSchema = z.strictObject({
  icon: z
    .strictObject({
      src: z
        .string()
        .min(1)
        .max(200)
        .refine((value) => !/^https?:/i.test(value), "must be a local asset path, not a remote URL"),
      alt: z.string().trim().min(1).max(120).optional(),
      license: z.string().trim().min(1).max(80),
      source: httpsUrlSchema,
    })
    .optional(),
});

export const archiveSchema = z.strictObject({
  at: isoDateSchema,
  reason: z.string().trim().min(1).max(200),
});

export type Archive = z.infer<typeof archiveSchema>;

/**
 * Structural record schema. Date freshness and publication rules live in
 * `createRecordSchema`, which needs a reference date.
 */
export const recordSchema = z.strictObject({
  id: slugSchema,
  kind: recordKindSchema,
  form: recordFormSchema,
  title: z.string().trim().min(1).max(80),
  summary: z
    .string()
    .trim()
    .min(20)
    .max(180)
    .refine(isPlainText, "must be plain text without markup"),
  description: z.string().trim().min(1).max(4000),
  categories: z.array(slugSchema).min(1).max(4),
  platforms: z.array(slugSchema).min(1).max(6),
  tags: z.array(slugSchema).max(8).optional(),
  /** Plugin binary formats only. Audio codecs (MP3, FLAC) are not modelled here. */
  formats: z.array(pluginFormatSchema).min(1).max(8).optional(),
  licensing: licensingSchema.optional(),
  pricing: pricingSchema.optional(),
  links: linksSchema,
  channels: z.array(channelSchema).max(20).optional(),
  verification: verificationSchema.optional(),
  status: recordStatusSchema,
  addedAt: isoDateSchema,
  updatedAt: isoDateSchema,
  /** Present on a variant record; maximum family depth is one level. */
  variantOf: slugSchema.optional(),
  archive: archiveSchema.optional(),
  searchTerms: z.array(z.string().trim().min(2).max(40)).max(6).optional(),
  related: z.array(slugSchema).max(4).optional(),
  offline: offlineCapabilitySchema.optional(),
  media: mediaSchema.optional(),
});

export type CatalogRecord = z.infer<typeof recordSchema>;

/**
 * Record schema with date-dependent and publication rules applied.
 * Pass a fixed `today` in tests so results are deterministic.
 */
export function createRecordSchema(today: string = todayISO()) {
  return recordSchema.superRefine((record, ctx) => {
    const fail = (path: Array<string | number>, message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    if (isAfter(record.addedAt, today)) {
      fail(["addedAt"], `must not be after ${today}`);
    }
    if (isAfter(record.updatedAt, today)) {
      fail(["updatedAt"], `must not be after ${today}`);
    }
    if (record.updatedAt < record.addedAt) {
      fail(["updatedAt"], "must not precede addedAt");
    }

    if (record.variantOf === record.id) {
      fail(["variantOf"], "a record cannot be a variant of itself");
    }

    if (record.form === "plugin" && !record.formats?.length) {
      fail(["formats"], "plugins require at least one plugin format");
    }
    if (record.form !== "plugin" && record.formats?.length) {
      fail(["formats"], "only plugin records may declare plugin formats");
    }

    if (record.status === "published") {
      if (!record.licensing) {
        fail(["licensing"], "published records require licensing");
      }
      if (!record.pricing) {
        fail(["pricing"], "published records require pricing");
      }
      if (!record.channels?.length) {
        fail(["channels"], "published records require at least one channel");
      }
      if (!record.verification) {
        fail(["verification"], "published records require verification");
      } else {
        if (
          !record.verification.evidence.some(
            (item) => item.kind === "official-site" || item.kind === "store-listing",
          )
        ) {
          fail(
            ["verification", "evidence"],
            "published records require official-site or store-listing evidence",
          );
        }
        if (record.verification.status !== "verified") {
          fail(
            ["verification", "status"],
            "published records require verification status verified",
          );
        }
      }
    }

    if (record.status === "archived" && !record.archive) {
      fail(["archive"], "archived records require archive metadata");
    }

    if (record.archive && isAfter(record.archive.at, today)) {
      fail(["archive", "at"], `must not be after ${today}`);
    }

    if (record.verification) {
      if (
        record.verification.lastVerifiedAt &&
        isAfter(record.verification.lastVerifiedAt, today)
      ) {
        fail(["verification", "lastVerifiedAt"], `must not be after ${today}`);
      }
      record.verification.evidence.forEach((item, index) => {
        if (isAfter(item.checkedAt, today)) {
          fail(["verification", "evidence", index, "checkedAt"], `must not be after ${today}`);
        }
      });
    }

    if (record.searchTerms) {
      const seen = new Set<string>();
      record.searchTerms.forEach((term, index) => {
        const normalized = term.toLowerCase();
        if (seen.has(normalized)) {
          fail(["searchTerms", index], "must not repeat a previous search term");
        }
        seen.add(normalized);
        if (normalized === record.title.toLowerCase()) {
          fail(["searchTerms", index], "must differ from the title");
        }
      });
    }

    if (record.related?.includes(record.id)) {
      fail(["related"], "must not reference the record itself");
    }
  });
}
