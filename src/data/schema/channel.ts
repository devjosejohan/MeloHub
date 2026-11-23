import { z } from "zod";
import { httpsUrlSchema, looksLikeInstallerFile, slugSchema } from "./primitives";

export const channelTypes = [
  "direct-download",
  "store",
  "repository-release",
  "package-manager",
  "package-registry",
  "web-app",
  "source-code",
] as const;

/** Delivery and package formats. Plugin binary formats belong in `formats[]`, never here. */
export const packageFormats = [
  "exe-installer",
  "msi",
  "dmg",
  "pkg",
  "apk",
  "ipa",
  "flatpak",
  "snap",
  "appimage",
  "deb",
  "rpm",
  "distro-package",
  "portable-archive",
  "source-archive",
  "other",
] as const;

export const channelTypeSchema = z.enum(channelTypes);
export const packageFormatSchema = z.enum(packageFormats);

export type ChannelType = (typeof channelTypes)[number];
export type PackageFormat = (typeof packageFormats)[number];

/**
 * One acquisition route. `url` must be a stable page: version-specific installer files
 * are rejected because they 404 on the next release.
 */
export const channelSchema = z
  .strictObject({
    type: channelTypeSchema,
    url: httpsUrlSchema,
    platform: slugSchema.optional(),
    format: packageFormatSchema.optional(),
    note: z.string().trim().min(1).max(140).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.format === "other" && !value.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: 'format "other" requires an explanatory note',
      });
    }

    if (looksLikeInstallerFile(value.url)) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: "must link to a stable acquisition page, not a versioned installer file",
      });
    }
  });

export type Channel = z.infer<typeof channelSchema>;
