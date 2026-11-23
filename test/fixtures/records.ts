import type { CatalogRecord } from "../../src/data/schema/record";

/**
 * Temporary validation fixtures from Mission 003.1.
 * These are NOT catalog content and must never be published.
 */

export const foobar2000: CatalogRecord = {
  id: "foobar2000",
  kind: "software",
  form: "application",
  title: "foobar2000",
  summary: "Advanced audio player for Windows and macOS with a component ecosystem.",
  description:
    "foobar2000 is a proprietary audio player for Windows and macOS with a long-standing component ecosystem. The desktop application is distributed as a direct download from the vendor.",
  categories: ["audio-playback"],
  platforms: ["windows", "macos"],
  tags: ["gapless", "component-ecosystem"],
  licensing: {
    model: "proprietary",
    name: "foobar2000 license",
    url: "https://www.foobar2000.org/license",
  },
  pricing: { models: ["free"] },
  links: {
    official: "https://www.foobar2000.org",
    docs: "https://www.foobar2000.org/support",
  },
  channels: [
    {
      type: "direct-download",
      url: "https://www.foobar2000.org/download",
      platform: "windows",
      format: "exe-installer",
      note: "32-bit, 64-bit and ARM64 installers",
    },
    {
      type: "direct-download",
      url: "https://www.foobar2000.org/mac",
      platform: "macos",
      format: "dmg",
    },
    {
      type: "store",
      url: "https://www.foobar2000.org/get-windows",
      platform: "windows",
      note: "Vendor redirect to the Microsoft Store listing",
    },
  ],
  verification: {
    status: "verified",
    lastVerifiedAt: "2026-11-23",
    verifiedBy: "Johan",
    method: "Official site and licence page",
    evidence: [
      {
        kind: "official-site",
        url: "https://www.foobar2000.org/windows",
        checkedAt: "2026-11-23",
      },
      {
        kind: "license-file",
        url: "https://www.foobar2000.org/license",
        checkedAt: "2026-11-23",
      },
      {
        kind: "official-site",
        url: "https://www.foobar2000.org/mac",
        checkedAt: "2026-11-23",
      },
    ],
  },
  status: "published",
  addedAt: "2026-11-20",
  updatedAt: "2026-11-23",
  searchTerms: ["foobar"],
};

export const foobar2000Mobile: CatalogRecord = {
  id: "foobar2000-mobile",
  kind: "software",
  form: "application",
  title: "foobar2000 mobile",
  summary: "Mobile foobar2000 player for Android, iOS and Apple TV.",
  description:
    "foobar2000 mobile is the mobile product line of the foobar2000 player, distributed through app stores and direct APK or IPA downloads. It has its own licence document and release stream.",
  categories: ["audio-playback"],
  platforms: ["android", "ios", "tvos"],
  licensing: {
    model: "proprietary",
    name: "foobar2000 mobile license",
    url: "https://www.foobar2000.org/license-mobile",
  },
  pricing: { models: ["free"] },
  links: { official: "https://www.foobar2000.org" },
  channels: [
    {
      type: "direct-download",
      url: "https://www.foobar2000.org/android",
      platform: "android",
      format: "apk",
      note: "Per-ABI APK builds",
    },
    {
      type: "store",
      url: "https://www.foobar2000.org/get-android",
      platform: "android",
    },
    {
      type: "direct-download",
      url: "https://www.foobar2000.org/ios",
      platform: "ios",
      format: "ipa",
    },
    {
      type: "store",
      url: "https://www.foobar2000.org/get-ios",
      platform: "ios",
    },
  ],
  verification: {
    status: "verified",
    lastVerifiedAt: "2026-11-23",
    verifiedBy: "Johan",
    method: "Vendor platform pages, licence page and news page",
    evidence: [
      {
        kind: "official-site",
        url: "https://www.foobar2000.org/android",
        checkedAt: "2026-11-23",
      },
      {
        kind: "official-site",
        url: "https://www.foobar2000.org/ios",
        checkedAt: "2026-11-23",
      },
      {
        kind: "license-file",
        url: "https://www.foobar2000.org/license-mobile",
        checkedAt: "2026-11-23",
      },
      {
        kind: "official-site",
        url: "https://www.foobar2000.org/news",
        checkedAt: "2026-11-23",
        note: "Apple TV availability announced 2026-11-04",
      },
    ],
    note: "Apple TV availability is confirmed by the vendor news page; no stable tvOS store URL was captured.",
  },
  status: "published",
  addedAt: "2026-11-20",
  updatedAt: "2026-11-23",
  variantOf: "foobar2000",
  searchTerms: ["foobar mobile"],
};

export const musicolet: CatalogRecord = {
  id: "musicolet",
  kind: "software",
  form: "application",
  title: "Musicolet",
  summary: "Offline music player for Android that organises and plays local audio files.",
  description:
    "Musicolet is an offline Android music player focused on local file playback, multiple queues and tag editing. The vendor states that the app requests no internet permission.",
  categories: ["audio-playback"],
  platforms: ["android"],
  tags: ["offline", "equalizer", "android-auto"],
  pricing: { models: ["free"], inAppPurchases: true },
  links: { official: "https://krosbits.in/musicolet/" },
  channels: [
    {
      type: "store",
      url: "https://play.google.com/store/apps/details?id=in.krosbits.musicolet",
      platform: "android",
    },
    {
      type: "store",
      url: "https://galaxy.store/krosbits1",
      platform: "android",
      note: "Vendor shortlink; did not resolve during review, listing URL not captured",
    },
    {
      type: "store",
      url: "https://www.amazon.com/gp/product/B09C2FZDXC/",
      platform: "android",
    },
    {
      type: "store",
      url: "https://appgallery.huawei.com/#/app/C103991927",
      platform: "android",
      note: "Huawei AppGallery listing linked from the vendor homepage",
    },
    {
      type: "direct-download",
      url: "https://krosbits.in/musicolet/download",
      platform: "android",
      format: "apk",
    },
  ],
  verification: {
    status: "needs-review",
    method: "Vendor site and Google Play listing",
    evidence: [
      {
        kind: "official-site",
        url: "https://krosbits.in/musicolet/",
        checkedAt: "2026-11-23",
      },
      {
        kind: "store-listing",
        url: "https://play.google.com/store/apps/details?id=in.krosbits.musicolet",
        checkedAt: "2026-11-23",
        note: "Listing displays in-app purchases and a 10M+ download band",
      },
    ],
    note: "Vendor site presents the app as free with no payment path; the Play listing shows in-app purchases. No licence document was found on the reviewed pages. Both sources retained; licensing remains unresolved.",
  },
  status: "draft",
  addedAt: "2026-11-23",
  updatedAt: "2026-11-23",
};

export const audiomass: CatalogRecord = {
  id: "audiomass",
  kind: "software",
  form: "web-app",
  title: "AudioMass",
  summary: "Browser-based multitrack audio and waveform editor that requires no installation.",
  description:
    "AudioMass is a browser-based audio and waveform editor with a multitrack mode. It runs entirely in the browser and its source code is published under the MIT licence.",
  categories: ["audio-editing"],
  platforms: ["web"],
  tags: ["multitrack"],
  licensing: {
    model: "open-source",
    spdx: "MIT",
    url: "https://raw.githubusercontent.com/pkalogiros/AudioMass/production/LICENSE",
    note: "Bundled third-party libraries retain their own licences; see THIRD_PARTY_NOTICES.md.",
  },
  pricing: { models: ["free"] },
  links: {
    official: "https://audiomass.co",
    repository: "https://github.com/pkalogiros/AudioMass",
  },
  channels: [
    { type: "web-app", url: "https://audiomass.co", platform: "web" },
    {
      type: "source-code",
      url: "https://github.com/pkalogiros/AudioMass",
      format: "source-archive",
    },
  ],
  verification: {
    status: "verified",
    lastVerifiedAt: "2026-11-23",
    verifiedBy: "Johan",
    method: "Live site, repository and licence file",
    evidence: [
      { kind: "official-site", url: "https://audiomass.co", checkedAt: "2026-11-23" },
      {
        kind: "repository",
        url: "https://github.com/pkalogiros/AudioMass",
        checkedAt: "2026-11-23",
      },
      {
        kind: "license-file",
        url: "https://raw.githubusercontent.com/pkalogiros/AudioMass/production/LICENSE",
        checkedAt: "2026-11-23",
        note: "MIT text, despite the repository badge reporting Other",
      },
    ],
  },
  status: "published",
  addedAt: "2026-11-21",
  updatedAt: "2026-11-23",
  searchTerms: ["audio mass"],
};

export const vital: CatalogRecord = {
  id: "vital",
  kind: "software",
  form: "plugin",
  title: "Vital",
  summary: "Spectral warping wavetable synthesizer for Windows, macOS and Linux.",
  description:
    "Vital is a wavetable synthesizer distributed as a plugin with an additional standalone build. Its source code is published under GPLv3, while vendor-distributed binaries and bundled presets carry separate terms.",
  categories: ["audio-production"],
  platforms: ["windows", "macos", "linux"],
  tags: ["wavetable-synthesis", "mpe"],
  formats: ["vst3", "au"],
  licensing: {
    model: "open-source",
    spdx: "GPL-3.0-only",
    url: "https://raw.githubusercontent.com/mtytel/vital/main/LICENSE",
    note: "Source code is GPLv3 per the repository README, which states no 'or later' clause; SPDX recorded as GPL-3.0-only. Distributed binaries are sold under the Vital EULA; bundled presets are separately licensed and not redistributable.",
  },
  pricing: {
    models: ["freemium", "subscription"],
    limitation:
      "The free download includes the synth; text-to-wavetable is limited to 5 requests per day and subscriber preset packs require an active subscription.",
    pricingUrl: "https://vital.audio/#getvital",
  },
  links: {
    official: "https://vital.audio",
    repository: "https://github.com/mtytel/vital",
  },
  channels: [
    {
      type: "direct-download",
      url: "https://vital.audio/#getvital",
      note: "Vendor account required",
    },
    {
      type: "source-code",
      url: "https://github.com/mtytel/vital",
      format: "source-archive",
    },
  ],
  verification: {
    status: "needs-review",
    lastVerifiedAt: "2026-11-23",
    verifiedBy: "Johan",
    method: "Official site, EULA and repository",
    evidence: [
      { kind: "official-site", url: "https://vital.audio", checkedAt: "2026-11-23" },
      {
        kind: "official-site",
        url: "https://vital.audio/eula",
        checkedAt: "2026-11-23",
      },
      {
        kind: "repository",
        url: "https://github.com/mtytel/vital",
        checkedAt: "2026-11-23",
      },
      {
        kind: "license-file",
        url: "https://raw.githubusercontent.com/mtytel/vital/main/LICENSE",
        checkedAt: "2026-11-23",
      },
    ],
    note: "Vendor-distributed plugin formats are not confirmed; the recorded formats come from the public source build configuration.",
  },
  status: "draft",
  addedAt: "2026-11-22",
  updatedAt: "2026-11-23",
  searchTerms: ["vital synth"],
};

export const picard: CatalogRecord = {
  id: "musicbrainz-picard",
  kind: "software",
  form: "application",
  title: "MusicBrainz Picard",
  summary: "Cross-platform music tagger powered by the MusicBrainz database.",
  description:
    "MusicBrainz Picard is a cross-platform tagger that identifies audio files and writes metadata from the MusicBrainz database. It is distributed as installers, store packages and distribution packages.",
  categories: ["audio-utility"],
  platforms: ["windows", "macos", "linux"],
  tags: ["tag-editing", "batch-processing"],
  licensing: {
    model: "open-source",
    spdx: "GPL-2.0-or-later",
    url: "https://raw.githubusercontent.com/metabrainz/picard/master/COPYING.txt",
    note: "The licence file contains GPL-2.0 text; project metadata declares GPL-2.0-or-later.",
  },
  pricing: { models: ["free"] },
  links: {
    official: "https://picard.musicbrainz.org",
    repository: "https://github.com/metabrainz/picard",
    docs: "https://picard-docs.musicbrainz.org",
  },
  channels: [
    {
      type: "direct-download",
      url: "https://picard.musicbrainz.org/downloads/",
      platform: "windows",
      format: "exe-installer",
      note: "Installer and portable builds",
    },
    {
      type: "direct-download",
      url: "https://picard.musicbrainz.org/downloads/",
      platform: "macos",
      format: "dmg",
      note: "arm64 and x86_64 builds",
    },
    {
      type: "package-manager",
      url: "https://picard.musicbrainz.org/downloads/",
      platform: "linux",
      format: "flatpak",
      note: "Flathub instructions linked from the downloads page",
    },
    {
      type: "package-manager",
      url: "https://picard.musicbrainz.org/downloads/",
      platform: "linux",
      format: "snap",
      note: "Snap Store instructions linked from the downloads page",
    },
    {
      type: "package-manager",
      url: "https://picard.musicbrainz.org/downloads/",
      platform: "linux",
      format: "distro-package",
      note: "Arch, Debian, Fedora, Gentoo, openSUSE and Ubuntu PPA",
    },
    {
      type: "package-manager",
      url: "https://picard.musicbrainz.org/downloads/",
      format: "distro-package",
      note: "Haiku, FreeBSD and OpenBSD; secondary platforms outside the primary taxonomy",
    },
    {
      type: "direct-download",
      url: "https://picard.musicbrainz.org/downloads/",
      format: "source-archive",
      note: "Source tarball and zip",
    },
    {
      type: "source-code",
      url: "https://github.com/metabrainz/picard",
      format: "source-archive",
    },
  ],
  verification: {
    status: "verified",
    lastVerifiedAt: "2026-11-23",
    verifiedBy: "Johan",
    method: "Official site, downloads page, repository and licence file",
    evidence: [
      {
        kind: "official-site",
        url: "https://picard.musicbrainz.org/downloads/",
        checkedAt: "2026-11-23",
      },
      {
        kind: "repository",
        url: "https://github.com/metabrainz/picard",
        checkedAt: "2026-11-23",
      },
      {
        kind: "license-file",
        url: "https://raw.githubusercontent.com/metabrainz/picard/master/COPYING.txt",
        checkedAt: "2026-11-23",
      },
    ],
  },
  status: "published",
  addedAt: "2026-11-20",
  updatedAt: "2026-11-23",
  searchTerms: ["picard", "musicbrainz tagger"],
};

export const fixtureCatalog: CatalogRecord[] = [
  foobar2000,
  foobar2000Mobile,
  musicolet,
  audiomass,
  vital,
  picard,
];

export function clone<T>(value: T): T {
  return structuredClone(value);
}
