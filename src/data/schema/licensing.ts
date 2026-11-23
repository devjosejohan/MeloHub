import { z } from "zod";
import { httpsUrlSchema } from "./primitives";

export const licensingModels = [
  "open-source",
  "source-available",
  "proprietary",
  "public-domain",
] as const;

export const licensingModelSchema = z.enum(licensingModels);

export type LicensingModel = (typeof licensingModels)[number];

/**
 * `model` describes the licensing status of the source code. When distributed binaries or
 * bundled components carry different conditions, `note` must explain the distinction.
 */
export const licensingSchema = z
  .strictObject({
    model: licensingModelSchema,
    spdx: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9.+-]+$/, "must look like an SPDX licence identifier")
      .optional(),
    name: z.string().trim().min(1).max(80).optional(),
    url: httpsUrlSchema.optional(),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.model === "open-source") {
      if (!value.spdx) {
        ctx.addIssue({
          code: "custom",
          path: ["spdx"],
          message: "open-source records require an SPDX identifier",
        });
      }
      if (!value.url) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "open-source records require a URL to the licence text",
        });
      }
    }

    if (value.model !== "open-source" && value.spdx) {
      ctx.addIssue({
        code: "custom",
        path: ["spdx"],
        message: "SPDX identifiers apply only to open-source records",
      });
    }

    if (value.model === "proprietary" && !value.name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "proprietary records require the licence name",
      });
    }
  });

export type Licensing = z.infer<typeof licensingSchema>;
