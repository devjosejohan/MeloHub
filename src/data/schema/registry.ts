import { z } from "zod";
import { slugSchema } from "./primitives";

/**
 * Registry files are data, not code: adding a category or platform must not require a
 * schema change. Records reference registry ids, and the catalog pass proves they resolve.
 */

const registryName = z.string().trim().min(1).max(40);
const registryDescription = z.string().trim().min(1).max(200);
const navGroup = z.string().trim().min(1).max(30);
const order = z.number().int().nonnegative();

export const categoryRegistrySchema = z.array(
  z.strictObject({
    id: slugSchema,
    name: registryName,
    description: registryDescription,
    navGroup,
    order,
  }),
);

export const platformRegistrySchema = z.array(
  z.strictObject({
    id: slugSchema,
    name: registryName,
    navGroup,
    order,
  }),
);

export const tagRegistrySchema = z.array(
  z.strictObject({
    id: slugSchema,
    name: registryName,
    description: registryDescription.optional(),
  }),
);

export type CategoryRegistryEntry = z.infer<typeof categoryRegistrySchema>[number];
export type PlatformRegistryEntry = z.infer<typeof platformRegistrySchema>[number];
export type TagRegistryEntry = z.infer<typeof tagRegistrySchema>[number];
