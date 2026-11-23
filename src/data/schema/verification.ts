import { z } from "zod";
import { httpsUrlSchema, isoDateSchema } from "./primitives";

export const verificationStatuses = [
  "verified",
  "needs-review",
  "deprecated",
  "disputed",
] as const;

export const evidenceKinds = [
  "official-site",
  "store-listing",
  "repository",
  "license-file",
  "source-archive",
  "documentation",
  "release-notes",
  "independent-review",
] as const;

export const verificationStatusSchema = z.enum(verificationStatuses);
export const evidenceKindSchema = z.enum(evidenceKinds);

export type VerificationStatus = (typeof verificationStatuses)[number];
export type EvidenceKind = (typeof evidenceKinds)[number];

export const evidenceSchema = z.strictObject({
  kind: evidenceKindSchema,
  url: httpsUrlSchema,
  checkedAt: isoDateSchema,
  note: z.string().trim().min(1).max(120).optional(),
});

export type Evidence = z.infer<typeof evidenceSchema>;

/**
 * A human read the sources and recorded them. The schema can require a note when a record
 * is declared disputed, but it cannot detect contradictions between two pages.
 */
export const verificationSchema = z
  .strictObject({
    status: verificationStatusSchema,
    lastVerifiedAt: isoDateSchema.optional(),
    verifiedBy: z.string().trim().min(1).max(40).optional(),
    method: z.string().trim().min(1).max(120).optional(),
    evidence: z.array(evidenceSchema).min(1).max(10),
    note: z.string().trim().min(1).max(400).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "verified") {
      if (!value.lastVerifiedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["lastVerifiedAt"],
          message: "verified records require a verification date",
        });
      }
      if (!value.verifiedBy) {
        ctx.addIssue({
          code: "custom",
          path: ["verifiedBy"],
          message: "verified records require a named reviewer",
        });
      }
    }

    if (value.status === "disputed" && !value.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "disputed records require a note describing the contradiction",
      });
    }
  });

export type Verification = z.infer<typeof verificationSchema>;
