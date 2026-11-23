import { describe, expect, it } from "vitest";
import { validateRecord } from "../../src/data/validation/record-validation";
import {
  audiomass,
  clone,
  foobar2000,
  musicolet,
  vital,
} from "../fixtures/records";

const TODAY = "2026-11-23";
const options = { today: TODAY };

function pass(record: unknown) {
  const result = validateRecord(record, options);
  expect(result.issues).toEqual([]);
  expect(result.ok).toBe(true);
  return result;
}

function fail(record: unknown, expectedPath?: string) {
  const result = validateRecord(record, options);
  expect(result.ok).toBe(false);
  expect(result.issues.length).toBeGreaterThan(0);
  if (expectedPath) {
    expect(result.issues.map((issue) => issue.path).join(" | ")).toContain(expectedPath);
  }
  return result;
}

describe("record schema — positive cases", () => {
  it("accepts a valid desktop application", () => {
    pass(foobar2000);
  });

  it("accepts a valid web application", () => {
    const result = pass(audiomass);
    expect(result.record?.form).toBe("web-app");
  });

  it("accepts a valid plugin with plugin formats", () => {
    const result = pass(vital);
    expect(result.record?.formats).toEqual(["vst3", "au"]);
  });
});

describe("record schema — forms and formats", () => {
  it("rejects a plugin without formats", () => {
    const invalid = clone(vital);
    delete invalid.formats;
    fail(invalid, "formats");
  });

  it("rejects a non-plugin declaring plugin formats", () => {
    const invalid = clone(audiomass);
    invalid.formats = ["vst3"];
    fail(invalid, "formats");
  });

  it("rejects an audio codec in formats", () => {
    const invalid = clone(vital) as unknown as { formats: string[] };
    invalid.formats = ["mp3"];
    fail(invalid, "formats");
  });
});

describe("record schema — publication requirements", () => {
  it("rejects a published record without licensing", () => {
    const invalid = clone(musicolet);
    invalid.status = "published";
    fail(invalid, "licensing");
  });

  it("rejects a published record without official-site or store-listing evidence", () => {
    const invalid = clone(audiomass);
    invalid.verification = {
      ...invalid.verification!,
      evidence: [
        {
          kind: "license-file",
          url: "https://raw.githubusercontent.com/pkalogiros/AudioMass/production/LICENSE",
          checkedAt: TODAY,
        },
      ],
    };
    fail(invalid, "verification.evidence");
  });

  it("rejects a published record without channels", () => {
    const invalid = clone(audiomass);
    delete invalid.channels;
    fail(invalid, "channels");
  });

  it("accepts a published record whose verification status is verified", () => {
    pass(audiomass);
  });

  it("rejects a published record whose verification status is needs-review", () => {
    const invalid = clone(audiomass);
    invalid.verification = { ...invalid.verification!, status: "needs-review" };
    fail(invalid, "verification.status");
  });

  it("rejects a published record whose verification status is disputed", () => {
    const invalid = clone(audiomass);
    invalid.verification = {
      ...invalid.verification!,
      status: "disputed",
      note: "Two sources describe the licence differently.",
    };
    fail(invalid, "verification.status");
  });

  it("accepts a draft record whose verification status is needs-review", () => {
    pass(musicolet);
  });
});

describe("record schema — licensing rules", () => {
  it("rejects an open-source record without an SPDX identifier", () => {
    const invalid = clone(audiomass);
    delete invalid.licensing?.spdx;
    fail(invalid, "licensing.spdx");
  });

  it("rejects an open-source record without a licence URL", () => {
    const invalid = clone(audiomass);
    delete invalid.licensing?.url;
    fail(invalid, "licensing.url");
  });

  it("rejects an SPDX identifier on a proprietary record", () => {
    const invalid = clone(foobar2000);
    invalid.licensing!.spdx = "MIT";
    fail(invalid, "licensing.spdx");
  });

  it("rejects a proprietary record without a licence name", () => {
    const invalid = clone(foobar2000);
    delete invalid.licensing?.name;
    fail(invalid, "licensing.name");
  });
});

describe("record schema — pricing rules", () => {
  it("rejects freemium without a limitation description", () => {
    const invalid = clone(vital);
    delete invalid.pricing?.limitation;
    fail(invalid, "pricing.limitation");
  });

  it("rejects paid, subscription and freemium models without a pricing URL", () => {
    const invalid = clone(vital);
    delete invalid.pricing?.pricingUrl;
    fail(invalid, "pricing.pricingUrl");
  });

  it("rejects free combined with freemium", () => {
    const invalid = clone(audiomass) as unknown as { pricing: { models: string[] } };
    invalid.pricing = { models: ["free", "freemium"] };
    fail(invalid, "pricing.models");
  });

  it("keeps an unknown in-app purchase state omitted", () => {
    const result = pass(foobar2000);
    expect(result.record?.pricing).toBeDefined();
    expect(result.record?.pricing && "inAppPurchases" in result.record.pricing).toBe(false);
  });

  it("keeps an unknown trial state omitted", () => {
    const result = pass(audiomass);
    expect(result.record?.pricing && "trial" in result.record.pricing).toBe(false);
  });

  it("accepts an observed in-app purchase flag", () => {
    const result = pass(musicolet);
    expect(result.record?.pricing?.inAppPurchases).toBe(true);
  });
});

describe("record schema — channels", () => {
  it("rejects format other without a note", () => {
    const invalid = clone(audiomass);
    invalid.channels = [
      ...(invalid.channels ?? []),
      {
        type: "direct-download",
        url: "https://audiomass.co/download",
        format: "other",
      },
    ];
    fail(invalid, "channels");
  });

  it("accepts format other with a note", () => {
    const valid = clone(audiomass);
    valid.channels = [
      ...(valid.channels ?? []),
      {
        type: "direct-download",
        url: "https://audiomass.co/download",
        format: "other",
        note: "Plain HTML bundle without a package format",
      },
    ];
    pass(valid);
  });

  it("rejects a version-specific installer file as a channel URL", () => {
    const invalid = clone(audiomass);
    invalid.channels = [
      ...(invalid.channels ?? []),
      {
        type: "direct-download",
        url: "https://audiomass.co/releases/audiomass-1.0.0.apk",
        format: "apk",
      },
    ];
    fail(invalid, "channels");
  });
});

describe("record schema — lifecycle", () => {
  it("rejects an archived record without archive metadata", () => {
    const invalid = clone(audiomass);
    invalid.status = "archived";
    fail(invalid, "archive");
  });

  it("accepts an archived record with archive metadata", () => {
    const valid = clone(audiomass);
    valid.status = "archived";
    valid.archive = { at: TODAY, reason: "Project discontinued" };
    pass(valid);
  });

  it("rejects a disputed record without a verification note", () => {
    const invalid = clone(audiomass);
    invalid.verification = { ...invalid.verification!, status: "disputed" };
    fail(invalid, "verification.note");
  });

  it("accepts a disputed draft record with a verification note", () => {
    const valid = clone(musicolet);
    valid.verification = {
      ...valid.verification!,
      status: "disputed",
      note: "Two sources describe the licence differently.",
    };
    pass(valid);
  });

  it("rejects a record that is its own variant", () => {
    const invalid = clone(audiomass);
    invalid.variantOf = "audiomass";
    fail(invalid, "variantOf");
  });
});

describe("record schema — dates", () => {
  it("rejects a future addedAt", () => {
    const invalid = clone(audiomass);
    invalid.addedAt = "2027-01-01";
    fail(invalid, "addedAt");
  });

  it("rejects an impossible calendar date", () => {
    const invalid = clone(audiomass);
    invalid.addedAt = "2026-02-30";
    fail(invalid, "addedAt");
  });

  it("rejects updatedAt before addedAt", () => {
    const invalid = clone(audiomass);
    invalid.addedAt = "2026-11-22";
    invalid.updatedAt = "2026-11-21";
    fail(invalid, "updatedAt");
  });

  it("rejects a future evidence check date", () => {
    const invalid = clone(audiomass);
    invalid.verification!.evidence[0]!.checkedAt = "2027-01-01";
    fail(invalid, "verification.evidence");
  });

  it("rejects a future verification date", () => {
    const invalid = clone(audiomass);
    invalid.verification!.lastVerifiedAt = "2027-01-01";
    fail(invalid, "verification.lastVerifiedAt");
  });
});

describe("record schema — strictness", () => {
  it("rejects unknown fields", () => {
    const invalid = clone(audiomass) as unknown as Record<string, unknown>;
    invalid.downloads = [];
    fail(invalid);
  });

  it("rejects markup in the summary", () => {
    const invalid = clone(audiomass);
    invalid.summary = "Browser-based <b>audio</b> editor for multitrack work.";
    fail(invalid, "summary");
  });
});
