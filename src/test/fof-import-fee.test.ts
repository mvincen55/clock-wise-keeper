import { describe, it, expect } from "vitest";
import { resolveImportedFee } from "@/lib/fof/import-fee";

// Numbers below are the real case that exposed this: a treatment plan
// screenshot whose "Fee" column prints the patient's BCBS contracted rate
// wherever the carrier has one, and the office fee everywhere else.

describe("resolveImportedFee — the PMS OFFICE column wins", () => {
  it("takes the OFFICE column over everything else", () => {
    const r = resolveImportedFee({
      code: "D6010",
      pmsOfficeFeeCents: 271700,
      onFileFeeCents: 271700,
      contractedFeeCents: 216341,
    });
    expect(r.feeCents).toBe(271700);
    expect(r.flag).toBe("");
    expect(r.unpriced).toBe(false);
  });

  it("flags an OFFICE column that disagrees with our schedule, and still uses it", () => {
    const r = resolveImportedFee({
      code: "D6010",
      pmsOfficeFeeCents: 280000,
      onFileFeeCents: 271700,
      contractedFeeCents: 216341,
    });
    expect(r.feeCents).toBe(280000);
    expect(r.flag).toContain("using the PMS office fee");
    expect(r.unpriced).toBe(false);
  });
});

describe("resolveImportedFee — our fee schedule beats the Fee column", () => {
  it("uses the office fee and flags the contracted number it ignored", () => {
    // D6010 on the plan reads 2,163.41 (BCBS); the office fee is 2,717.00.
    const r = resolveImportedFee({
      code: "D6010",
      pmsOfficeFeeCents: null,
      onFileFeeCents: 271700,
      contractedFeeCents: 216341,
    });
    expect(r.feeCents).toBe(271700);
    expect(r.flag).toContain("$2,163.41");
    expect(r.flag).toContain("using our office fee $2,717.00");
    expect(r.unpriced).toBe(false);
  });

  it("stays quiet when the screenshot agrees with our schedule", () => {
    // D4265 reads 523.00 on the plan and on the office schedule.
    const r = resolveImportedFee({
      code: "D4265",
      pmsOfficeFeeCents: null,
      onFileFeeCents: 52300,
      contractedFeeCents: 52300,
    });
    expect(r.feeCents).toBe(52300);
    expect(r.flag).toBe("");
    expect(r.unpriced).toBe(false);
  });

  it("uses the office fee when the screenshot has no fee at all", () => {
    const r = resolveImportedFee({
      code: "D0220",
      pmsOfficeFeeCents: null,
      onFileFeeCents: 4700,
      contractedFeeCents: null,
    });
    expect(r.feeCents).toBe(4700);
    expect(r.flag).toBe("");
  });
});

describe("resolveImportedFee — nothing on file", () => {
  it("flags a screenshot fee adopted with no office fee behind it", () => {
    // The bug: D7140 is not on the office schedule, so 171.61 — a BCBS
    // contracted rate — landed in the office fee column with no warning.
    const r = resolveImportedFee({
      code: "D7140",
      pmsOfficeFeeCents: null,
      onFileFeeCents: null,
      contractedFeeCents: 17161,
    });
    expect(r.feeCents).toBe(17161);
    expect(r.unpriced).toBe(true);
    expect(r.flag).toContain("No office fee on file for D7140");
    expect(r.flag).toContain("$171.61");
    expect(r.flag).toContain("contracted insurance rate");
    expect(r.flag).toContain("Office Fee Schedule");
  });

  it("still names the problem when the code is blank", () => {
    const r = resolveImportedFee({
      code: "",
      pmsOfficeFeeCents: null,
      onFileFeeCents: null,
      contractedFeeCents: 17161,
    });
    expect(r.unpriced).toBe(true);
    expect(r.flag).toContain("this code");
  });

  it("returns no fee, and no noise, when the row carried no number", () => {
    const r = resolveImportedFee({
      code: "9434",
      pmsOfficeFeeCents: null,
      onFileFeeCents: null,
      contractedFeeCents: null,
    });
    expect(r.feeCents).toBeNull();
    expect(r.flag).toBe("");
    expect(r.unpriced).toBe(false);
  });
});

describe("resolveImportedFee — a contracted fee never lands silently", () => {
  it("flags every row whose fee came from the screenshot's Fee column", () => {
    const fromScreenshot = [
      { code: "D7140", onFile: null, contracted: 17161 },
      { code: "D6011", onFile: null, contracted: 34498 },
      { code: "D6057", onFile: null, contracted: 83863 },
    ];
    for (const row of fromScreenshot) {
      const r = resolveImportedFee({
        code: row.code,
        pmsOfficeFeeCents: null,
        onFileFeeCents: row.onFile,
        contractedFeeCents: row.contracted,
      });
      expect(r.feeCents).toBe(row.contracted);
      expect(r.flag).not.toBe("");
      expect(r.unpriced).toBe(true);
    }
  });
});
