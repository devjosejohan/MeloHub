import { z } from "zod";
import { httpsUrlSchema } from "./primitives";

export const pricingModels = [
  "free",
  "freemium",
  "paid",
  "subscription",
  "donationware",
] as const;

export const pricingModelSchema = z.enum(pricingModels);

export type PricingModel = (typeof pricingModels)[number];

const paidModels = new Set<PricingModel>(["freemium", "paid", "subscription"]);

/**
 * Commercial terms only. No prices or currencies are stored; `pricingUrl` points at the
 * vendor's current pricing page. Unknown facts stay omitted rather than defaulting to false.
 */
export const pricingSchema = z
  .strictObject({
    models: z.array(pricingModelSchema).min(1).max(3),
    inAppPurchases: z.boolean().optional(),
    trial: z.boolean().optional(),
    limitation: z.string().trim().min(1).max(200).optional(),
    pricingUrl: httpsUrlSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.models);

    if (unique.size !== value.models.length) {
      ctx.addIssue({
        code: "custom",
        path: ["models"],
        message: "pricing models must not repeat",
      });
    }

    if (
      unique.has("free") &&
      (unique.has("freemium") || unique.has("paid") || unique.has("subscription"))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["models"],
        message: "free cannot be combined with freemium, paid or subscription",
      });
    }

    if (unique.has("freemium") && !value.limitation) {
      ctx.addIssue({
        code: "custom",
        path: ["limitation"],
        message: "freemium records must describe what the free tier excludes",
      });
    }

    const requiresPricingUrl = [...unique].some((model) => paidModels.has(model));
    if (requiresPricingUrl && !value.pricingUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["pricingUrl"],
        message: "paid, subscription and freemium records require a pricing URL",
      });
    }
  });

export type Pricing = z.infer<typeof pricingSchema>;
