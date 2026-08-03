import { describe, it, expect } from "vitest";
import { parseCurrencyInput, parseScheduleFee } from "@/lib/fof/money";
import { estimateInsurance, type FofLine, type PlanRules } from "@/lib/fof/insurance";

// Dentrix marks a carrier row that is really the office fee with a
// trailing asterisk: "520.00*" means there is no negotiated rate for that
// code. Values below are real rows from the BCBS MA export.

describe("parseScheduleFee", () => {
  it("reads a contracted fee", () => {
    expect(parseScheduleFee("171.61")).toEqual({ cents: 17161, isOfficeFee: false });
  });
  it("reads an asterisked fee as the office fee", () => {
    expect(parseScheduleFee("520.00*")).toEqual({ cents: 52000, isOfficeFee: true });
  });
  it("handles thousands separators either way", () => {
    expect(parseScheduleFee("2,163.41")).toEqual({ cents: 216341, isOfficeFee: false });
    expect(parseScheduleFee("1,010.00*")).toEqual({ cents: 101000, isOfficeFee: true });
  });
  it("keeps a zero office fee distinct from a zero contracted fee", () => {
    expect(parseScheduleFee("0.00*")).toEqual({ cents: 0, isOfficeFee: true });
    expect(parseScheduleFee("0.00")).toEqual({ cents: 0, isOfficeFee: false });
  });
  it("tolerates surrounding whitespace", () => {
    expect(parseScheduleFee("  838.63  ")).toEqual({ cents: 83863, isOfficeFee: false });
  });
  it("rejects anything that is not an amount", () => {
    expect(parseScheduleFee("")).toBeNull();
    expect(parseScheduleFee("*")).toBeNull();
    expect(parseScheduleFee("n/a")).toBeNull();
  });
  it("leaves parseCurrencyInput strict — a typed fee never carries an asterisk", () => {
    expect(parseCurrencyInput("520.00*")).toBeNull();
    expect(parseCurrencyInput("520.00")).toBe(52000);
  });
});

// The whole point of the flag: an office-fee row is NOT an allowable, so
// it must not create a write-off — and must not go stale when the office
// raises its fee. Dropping it from the allowable map makes insurance.ts
// fall back to the current office fee.

const plan: PlanRules = {
  preventivePct: 100,
  basicPct: 80,
  majorPct: 50,
  deductibleWaivedPreventive: true,
  writeoffApplies: true,
};

const benefits = { remainingDeductibleCents: 0, remainingAnnualMaxCents: 1_000_000 };

// D2799 provisional crown: BCBS lists it as "838.00*" — the office fee,
// no contracted rate — and it falls in a category the plan DOES cover, so
// a stale allowable here would really move money.
const line = (overrides: Partial<FofLine>): FofLine => ({
  code: "D2799",
  description: "Provisional crown",
  category: "major",
  officeFeeCents: 83800,
  allowedCents: null,
  ...overrides,
});

describe("an office-fee row produces no write-off", () => {
  it("no allowable → the office fee is used and nothing is written off", () => {
    const result = estimateInsurance([line({})], plan, benefits);
    expect(result.writeOffCents).toBe(0);
    expect(result.perLine[0].allowedCents).toBe(83800);
  });

  it("stays at zero after the office raises the fee", () => {
    // The office moves D2799 from 838 to 900. With the row kept out of
    // the allowable map there is nothing stale to subtract against.
    const result = estimateInsurance([line({ officeFeeCents: 90000 })], plan, benefits);
    expect(result.writeOffCents).toBe(0);
  });

  it("a stored allowable of the OLD office fee would have invented one", () => {
    // What storing it as an allowable looks like a year later: the 838
    // copy against an office fee of 900 — a $62 write-off nobody agreed to.
    const result = estimateInsurance(
      [line({ officeFeeCents: 90000, allowedCents: 83800 })],
      plan,
      benefits
    );
    expect(result.writeOffCents).toBe(6200);
  });

  it("a genuine contracted rate still writes off the difference", () => {
    // D7140: office 253.00, BCBS contracted 171.61 → 81.39 write-off.
    const result = estimateInsurance(
      [line({ code: "D7140", category: "basic", officeFeeCents: 25300, allowedCents: 17161 })],
      plan,
      benefits
    );
    expect(result.writeOffCents).toBe(8139);
  });
});

// A spreadsheet's number column eats everything that is not a digit:
// Excel stores CDT D0120 as 120. That is how the Altus schedule arrived
// with 693 codes the FOF could never resolve — and with a few that
// collided with the office's own custom numeric codes, applying one
// procedure's allowable to a different procedure entirely.

/** Mirrors cellCode() in FeeImportDialog. */
const cellCode = (value: string | number | null | undefined, cdtPrefix: boolean): string => {
  const numeric =
    typeof value === "number" && isFinite(value) && Number.isInteger(value) && value > 0 && value < 10000;
  const text =
    numeric ? String(value).padStart(4, "0") : String(value ?? "").trim().toUpperCase();
  return cdtPrefix && /^\d{4}$/.test(text) ? `D${text}` : text;
};

describe("importing a code column that lost its D", () => {
  it("rebuilds the CDT code from a bare number", () => {
    expect(cellCode(120, true)).toBe("D0120");
    expect(cellCode(7140, true)).toBe("D7140");
    expect(cellCode(9110, true)).toBe("D9110");
  });

  it("zero-pads even when the D is not wanted", () => {
    expect(cellCode(120, false)).toBe("0120");
  });

  it("leaves codes that already carry the D alone", () => {
    expect(cellCode("D0120", true)).toBe("D0120");
    expect(cellCode("d7140", true)).toBe("D7140");
  });

  it("never prefixes a code that is not four digits", () => {
    // Custom office codes keep their own shape.
    expect(cellCode("111B", true)).toBe("111B");
    expect(cellCode("CADCAMSI", true)).toBe("CADCAMSI");
    expect(cellCode("XX232", true)).toBe("XX232");
    expect(cellCode(15010, true)).toBe("15010");
  });

  it("keeps the office's custom numbers distinct from CDT when off", () => {
    // The collision that made Altus wrong: the office's 9110 is a HIPAA
    // acknowledgement, CDT D9110 is palliative treatment.
    expect(cellCode(9110, false)).toBe("9110");
    expect(cellCode(9110, true)).toBe("D9110");
  });
});
