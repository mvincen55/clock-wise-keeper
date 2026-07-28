import { describe, it, expect } from "vitest";
import {
  CATEGORY_LABELS,
  DEVICE_CATEGORIES,
  INCIDENT_CATEGORIES,
  PPE_LABELS,
  PPE_OPTIONS,
  SEVERITIES,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUSES,
  STATUS_CLASSES,
  STATUS_LABELS,
  TREATMENTS,
  TREATMENT_LABELS,
  formatClockTime,
  labelFor,
  yesterdayKey,
} from "@/lib/incidents";

// The database stores these as plain text with CHECK constraints, so the
// label maps are the only thing keeping the UI and the schema in step.
// Every allowed value must render as something a human wrote.

describe("label coverage", () => {
  it("labels every incident category", () => {
    for (const c of INCIDENT_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
  it("labels and styles every severity", () => {
    for (const s of SEVERITIES) {
      expect(SEVERITY_LABELS[s]).toBeTruthy();
      expect(SEVERITY_CLASSES[s]).toBeTruthy();
    }
  });
  it("labels and styles every status", () => {
    for (const s of STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_CLASSES[s]).toBeTruthy();
    }
  });
  it("labels every PPE and treatment option", () => {
    for (const p of PPE_OPTIONS) expect(PPE_LABELS[p]).toBeTruthy();
    for (const t of TREATMENTS) expect(TREATMENT_LABELS[t]).toBeTruthy();
  });
  it("only asks for a device on categories that have one", () => {
    for (const c of DEVICE_CATEGORIES) {
      expect(INCIDENT_CATEGORIES).toContain(c);
    }
  });
});

describe("labelFor", () => {
  it("resolves a known value", () => {
    expect(labelFor(CATEGORY_LABELS, "sharps_injury")).toBe("Sharps / needlestick");
  });
  it("falls back to the raw value when the database grows a new one", () => {
    expect(labelFor(CATEGORY_LABELS, "future_category")).toBe("future_category");
  });
  it("uses the fallback for null and empty", () => {
    expect(labelFor(CATEGORY_LABELS, null)).toBe("—");
    expect(labelFor(CATEGORY_LABELS, "", "unset")).toBe("unset");
  });
});

describe("formatClockTime", () => {
  it("formats a Postgres time column ('HH:MM:SS')", () => {
    expect(formatClockTime("14:45:00")).toBe("2:45 PM");
  });
  it("formats the 'HH:MM' the time input produces", () => {
    expect(formatClockTime("09:05")).toBe("9:05 AM");
  });
  it("keeps midnight and noon on the 12-hour clock", () => {
    expect(formatClockTime("00:30:00")).toBe("12:30 AM");
    expect(formatClockTime("12:00:00")).toBe("12:00 PM");
  });
  it("returns empty for an unset or unparseable time", () => {
    expect(formatClockTime(null)).toBe("");
    expect(formatClockTime("")).toBe("");
    expect(formatClockTime("not a time")).toBe("");
  });
});

describe("yesterdayKey", () => {
  it("returns a YYYY-MM-DD key one day before today (Eastern)", () => {
    const key = yesterdayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const gap = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${key}T12:00:00Z`)) / 86_400_000;
    expect(gap).toBe(1);
  });
});
