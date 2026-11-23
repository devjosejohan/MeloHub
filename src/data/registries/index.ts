import categoriesJson from "./categories.json";
import platformsJson from "./platforms.json";
import tagsJson from "./tags.json";
import {
  categoryRegistrySchema,
  platformRegistrySchema,
  tagRegistrySchema,
} from "../schema/registry";

function assertUniqueIds(entries: ReadonlyArray<{ id: string }>, name: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`${name} registry contains a duplicate id: ${entry.id}`);
    }
    seen.add(entry.id);
  }
}

export const categories = categoryRegistrySchema.parse(categoriesJson);
export const platforms = platformRegistrySchema.parse(platformsJson);
export const tags = tagRegistrySchema.parse(tagsJson);

assertUniqueIds(categories, "category");
assertUniqueIds(platforms, "platform");
assertUniqueIds(tags, "tag");

export const categoryIds: ReadonlySet<string> = new Set(categories.map((entry) => entry.id));
export const platformIds: ReadonlySet<string> = new Set(platforms.map((entry) => entry.id));
export const tagIds: ReadonlySet<string> = new Set(tags.map((entry) => entry.id));
