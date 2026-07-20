import { describe, it, expect } from "vitest";
import {
  easternWallToUtcIso,
  parseTimeString,
  buildPunches,
  detectMispaired,
  validateConfirmImportInput,
  normalize,
} from "../../supabase/functions/confirm-import/lib";

describe("confirm-import easternWallToUtcIso (edge function copy)", () => {
  it("normal winter and summer dates", () => {
    expect(easternWallToUtcIso("2026-01-15", 9, 0)).toBe("2026-01-15T14:00:00.000Z");
    expect(easternWallToUtcIso("2026-07-15", 9, 0)).toBe("2026-07-15T13:00:00.000Z");
  });

  it("2026-03-08 02:30 (nonexistent, spring-forward gap) shifts forward to 03:30 EDT", () => {
    expect(easternWallToUtcIso("2026-03-08", 2, 30)).toBe("2026-03-08T07:30:00.000Z");
  });

  it("2026-11-01 01:30 (ambiguous, fall-back hour) resolves to earlier occurrence (EDT)", () => {
    expect(easternWallToUtcIso("2026-11-01", 1, 30)).toBe("2026-11-01T05:30:00.000Z");
  });

  it("post-transition mornings resolve with the post-transition offset", () => {
    expect(easternWallToUtcIso("2026-03-08", 6, 30)).toBe("2026-03-08T10:30:00.000Z");
    expect(easternWallToUtcIso("2026-11-01", 2, 0)).toBe("2026-11-01T07:00:00.000Z");
  });
});

describe("parseTimeString", () => {
  it("parses 12h times", () => {
    expect(parseTimeString("8:05 AM")).toEqual({ hours: 8, minutes: 5 });
    expect(parseTimeString("12:30 PM")).toEqual({ hours: 12, minutes: 30 });
    expect(parseTimeString("12:15 AM")).toEqual({ hours: 0, minutes: 15 });
    expect(parseTimeString("4:45PM")).toEqual({ hours: 16, minutes: 45 });
  });
  it("parses 24h times and rejects garbage", () => {
    expect(parseTimeString("17:20")).toEqual({ hours: 17, minutes: 20 });
    expect(parseTimeString("noonish")).toBeNull();
    expect(parseTimeString("")).toBeNull();
  });
});

describe("buildPunches", () => {
  it("alternates in/out positionally and converts to real UTC", () => {
    const built = buildPunches("2026-01-15", ["8:00 AM", "12:00 PM", "1:00 PM", "5:00 PM"]);
    expect(built.map(p => p.punch_type)).toEqual(["in", "out", "in", "out"]);
    expect(built.map(p => p.punch_time)).toEqual([
      "2026-01-15T13:00:00.000Z",
      "2026-01-15T17:00:00.000Z",
      "2026-01-15T18:00:00.000Z",
      "2026-01-15T22:00:00.000Z",
    ]);
    expect(built.every(p => p.parsed)).toBe(true);
  });

  it("strips asterisks and defaults unparseable times to noon, flagged unparsed", () => {
    const built = buildPunches("2026-01-15", ["*8:00 AM*", "???"]);
    expect(built[0].parsed).toBe(true);
    expect(built[0].punch_time).toBe("2026-01-15T13:00:00.000Z");
    expect(built[1].parsed).toBe(false);
    expect(built[1].punch_time).toBe("2026-01-15T17:00:00.000Z"); // noon ET
  });
});

describe("detectMispaired", () => {
  it("passes a clean even, parsed, chronological sequence", () => {
    const built = buildPunches("2026-01-15", ["8:00 AM", "12:00 PM", "1:00 PM", "5:00 PM"]);
    expect(detectMispaired(built)).toEqual({ mispaired: false, reasons: [] });
  });

  it("flags an odd punch count (unclosed shift)", () => {
    const built = buildPunches("2026-01-15", ["8:00 AM", "12:00 PM", "1:00 PM"]);
    const res = detectMispaired(built);
    expect(res.mispaired).toBe(true);
    expect(res.reasons.join()).toContain("odd punch count");
  });

  it("flags unparseable times", () => {
    const built = buildPunches("2026-01-15", ["8:00 AM", "abc"]);
    const res = detectMispaired(built);
    expect(res.mispaired).toBe(true);
    expect(res.reasons.join()).toContain("unparseable");
  });

  it("flags out-of-order times (a missed punch shifts every pairing)", () => {
    const built = buildPunches("2026-01-15", ["1:00 PM", "8:00 AM"]);
    const res = detectMispaired(built);
    expect(res.mispaired).toBe(true);
    expect(res.reasons.join()).toContain("chronological");
  });
});

describe("validateConfirmImportInput", () => {
  it("accepts a valid uuid and defaults strategy to skip", () => {
    expect(validateConfirmImportInput({ import_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }))
      .toEqual({ import_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", strategy: "skip" });
  });
  it("rejects bad ids and unknown strategies", () => {
    expect(() => validateConfirmImportInput({ import_id: "1; DROP TABLE punches" })).toThrow();
    expect(() => validateConfirmImportInput({ import_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", strategy: "clobber" })).toThrow();
  });
});

describe("normalize (employee matching)", () => {
  it("case/whitespace-insensitive", () => {
    expect(normalize("  Jane   DOE ")).toBe("jane doe");
    expect(normalize(null)).toBe("");
  });
});
