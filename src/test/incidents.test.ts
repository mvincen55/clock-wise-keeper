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
  SIGNATURE_CLASSES,
  SIGNATURE_LABELS,
  SIGNATURE_STATES,
  STATUSES,
  STATUS_CLASSES,
  STATUS_LABELS,
  TREATMENTS,
  TREATMENT_LABELS,
  countersignEligibility,
  formatClockTime,
  formatSignedAt,
  labelFor,
  signatureState,
  yesterdayKey,
  type CountersignContext,
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
  it("labels and styles every signature state", () => {
    for (const s of SIGNATURE_STATES) {
      expect(SIGNATURE_LABELS[s]).toBeTruthy();
      expect(SIGNATURE_CLASSES[s]).toBeTruthy();
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

describe("signatureState", () => {
  it("starts at the employee's signature", () => {
    expect(signatureState({ employee_signed_at: null, manager_signed_at: null }))
      .toBe("awaiting_employee");
  });
  it("moves to the sign-off once the employee signs", () => {
    expect(signatureState({ employee_signed_at: "2026-07-28T18:00:00Z", manager_signed_at: null }))
      .toBe("awaiting_countersign");
  });
  it("is complete on the countersignature, signed employee or not", () => {
    const at = "2026-07-28T19:00:00Z";
    expect(signatureState({ employee_signed_at: at, manager_signed_at: at })).toBe("complete");
    // A manager may sign off on a report the employee never signed —
    // someone who left, or was out for weeks. The loop still closes.
    expect(signatureState({ employee_signed_at: null, manager_signed_at: at })).toBe("complete");
  });
});

describe("countersignEligibility", () => {
  // Mirrors countersign_incident_report() in the database. The server
  // decides; this decides what the panel draws.
  const base: CountersignContext = {
    countersignRole: "manager",
    viewerRole: "manager",
    viewerIsSubject: false,
    alreadySigned: false,
    otherOwnerCount: 1,
  };

  it("lets any admin sign off on an employee's report", () => {
    expect(countersignEligibility(base).canSign).toBe(true);
    expect(countersignEligibility({ ...base, viewerRole: "owner" }).canSign).toBe(true);
  });

  it("keeps employees out of the sign-off", () => {
    const v = countersignEligibility({ ...base, viewerRole: "employee" });
    expect(v.canSign).toBe(false);
    expect(v.reason).toMatch(/owner or manager/i);
  });

  it("never lets anyone sign off on their own report", () => {
    const v = countersignEligibility({ ...base, viewerRole: "owner", viewerIsSubject: true });
    expect(v.canSign).toBe(false);
    expect(v.reason).toMatch(/about you/i);
  });

  it("sends a manager's own report up to an owner", () => {
    const v = countersignEligibility({ ...base, countersignRole: "owner" });
    expect(v.canSign).toBe(false);
    expect(v.reason).toMatch(/owner has to sign/i);
    expect(countersignEligibility({ ...base, countersignRole: "owner", viewerRole: "owner" }).canSign)
      .toBe(true);
  });

  it("falls back to any admin when the subject was the only owner", () => {
    expect(
      countersignEligibility({ ...base, countersignRole: "owner", otherOwnerCount: 0 }).canSign
    ).toBe(true);
  });

  it("offers nothing once it is signed off", () => {
    expect(countersignEligibility({ ...base, alreadySigned: true }).canSign).toBe(false);
  });
});

describe("formatSignedAt", () => {
  it("stamps the signature in office time", () => {
    // 18:30 UTC on a July day is 2:30 PM in New York.
    expect(formatSignedAt("2026-07-28T18:30:00Z")).toBe("Jul 28, 2026 at 2:30 PM");
  });
  it("is empty for an unsigned slot", () => {
    expect(formatSignedAt(null)).toBe("");
    expect(formatSignedAt("")).toBe("");
    expect(formatSignedAt("not a time")).toBe("");
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
