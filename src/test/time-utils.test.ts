import { describe, it, expect } from "vitest";
import {
  easternWallToUtcIso,
  easternTimeInputValue,
  getEasternOffsetMinutes,
  easternDateKey,
  calculatePunchMinutes,
} from "@/lib/time-utils";

// DST in 2026: spring forward Sun 2026-03-08 02:00 EST → 03:00 EDT,
// fall back Sun 2026-11-01 02:00 EDT → 01:00 EST.

describe("getEasternOffsetMinutes", () => {
  it("returns -300 (EST) in winter", () => {
    expect(getEasternOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(-300);
  });
  it("returns -240 (EDT) in summer", () => {
    expect(getEasternOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(-240);
  });
});

describe("easternWallToUtcIso — normal dates", () => {
  it("converts a winter morning (EST, UTC-5)", () => {
    expect(easternWallToUtcIso("2026-01-15", 9, 0)).toBe("2026-01-15T14:00:00.000Z");
  });
  it("converts a summer morning (EDT, UTC-4)", () => {
    expect(easternWallToUtcIso("2026-07-15", 9, 0)).toBe("2026-07-15T13:00:00.000Z");
  });
  it("converts an evening time that crosses UTC midnight", () => {
    expect(easternWallToUtcIso("2026-01-15", 22, 30)).toBe("2026-01-16T03:30:00.000Z");
  });
});

describe("easternWallToUtcIso — DST transitions", () => {
  it("spring-forward gap: nonexistent 2026-03-08 02:30 shifts forward to 03:30 EDT", () => {
    const iso = easternWallToUtcIso("2026-03-08", 2, 30);
    expect(iso).toBe("2026-03-08T07:30:00.000Z");
    expect(easternTimeInputValue(iso)).toBe("03:30");
  });

  it("fall-back ambiguity: 2026-11-01 01:30 resolves to the earlier occurrence (EDT)", () => {
    const iso = easternWallToUtcIso("2026-11-01", 1, 30);
    expect(iso).toBe("2026-11-01T05:30:00.000Z");
    expect(easternTimeInputValue(iso)).toBe("01:30");
  });

  it("just before the spring-forward gap stays EST", () => {
    expect(easternWallToUtcIso("2026-03-08", 1, 59)).toBe("2026-03-08T06:59:00.000Z");
  });

  it("morning after spring forward uses the EDT offset (regression: one-pass lookup was 1h off)", () => {
    // A naive single offset lookup resolves 06:30 wall via the pre-transition
    // EST offset and lands on 11:30Z (07:30 EDT). Correct answer: 10:30Z.
    const iso = easternWallToUtcIso("2026-03-08", 6, 30);
    expect(iso).toBe("2026-03-08T10:30:00.000Z");
    expect(easternTimeInputValue(iso)).toBe("06:30");
  });

  it("morning after fall back uses the EST offset (regression: one-pass lookup was 1h off)", () => {
    const iso = easternWallToUtcIso("2026-11-01", 2, 0);
    expect(iso).toBe("2026-11-01T07:00:00.000Z");
    expect(easternTimeInputValue(iso)).toBe("02:00");
  });

  it("afternoon of both transition days is unaffected", () => {
    expect(easternWallToUtcIso("2026-03-08", 17, 0)).toBe("2026-03-08T21:00:00.000Z");
    expect(easternWallToUtcIso("2026-11-01", 17, 0)).toBe("2026-11-01T22:00:00.000Z");
  });
});

describe("easternWallToUtcIso ↔ easternTimeInputValue round trip", () => {
  it("round-trips arbitrary wall times on normal days", () => {
    for (const [date, h, m] of [["2026-04-20", 7, 45], ["2026-12-24", 16, 5], ["2026-06-01", 0, 0]] as const) {
      const iso = easternWallToUtcIso(date, h, m);
      expect(easternTimeInputValue(iso)).toBe(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      expect(easternDateKey(iso)).toBe(date);
    }
  });
});

describe("calculatePunchMinutes", () => {
  it("totals paired in/out punches", () => {
    expect(calculatePunchMinutes([
      { punch_type: "in", punch_time: "2026-01-15T14:00:00Z" },
      { punch_type: "out", punch_time: "2026-01-15T17:30:00Z" },
      { punch_type: "in", punch_time: "2026-01-15T18:00:00Z" },
      { punch_type: "out", punch_time: "2026-01-15T22:00:00Z" },
    ])).toBe(210 + 240);
  });
});
