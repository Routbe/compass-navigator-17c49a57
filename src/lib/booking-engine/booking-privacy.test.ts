import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ROW = {
  id: "b1",
  status: "confirmed",
  start_utc: "2026-11-05T14:00:00Z",
  end_utc: "2026-11-05T14:30:00Z",
  guest_name: "Gast Persoon",
  guest_timezone: "Europe/Brussels",
  booking_token: "a".repeat(64),
  title: "Kennismaking",
  location_kind: "video",
  location_value: "https://meet.example/xyz",
};

const sqlMock = vi.fn();
vi.mock("@/lib/neon", () => ({ sql: (...args: unknown[]) => sqlMock(...args) }));

import { bookingSummary } from "./public.server";

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([BOOKING_ROW]);
});

describe("bookingSummary PII-afscherming (db/0144)", () => {
  it("lekt geen gast-PII bij een anoniem verzoek zonder token", async () => {
    const s = await bookingSummary("b1");
    expect(s).not.toBeNull();
    expect(s!.masked).toBe(true);
    expect(s!.guestName).toBeNull();
    expect(s!.guestTimezone).toBeNull();
    expect(s!.locationValue).toBeNull();
    // Wel publieke statusinfo:
    expect(s!.status).toBe("confirmed");
    expect(s!.startUtc).toBe("2026-11-05T14:00:00.000Z");
    expect(s!.title).toBe("Kennismaking");
  });

  it("lekt geen gast-PII bij een ongeldige token", async () => {
    const s = await bookingSummary("b1", "b".repeat(64));
    expect(s!.masked).toBe(true);
    expect(s!.guestName).toBeNull();
  });

  it("toont de gast-bevestiging met de juiste booking_token", async () => {
    const s = await bookingSummary("b1", "a".repeat(64));
    expect(s!.masked).toBe(false);
    expect(s!.guestName).toBe("Gast Persoon");
    expect(s!.guestTimezone).toBe("Europe/Brussels");
    expect(s!.locationValue).toBe("https://meet.example/xyz");
  });

  it("behandelt een token met afwijkende lengte als ongeldig (geen timingSafeEqual-crash)", async () => {
    const s = await bookingSummary("b1", "kort");
    expect(s!.masked).toBe(true);
  });

  it("geeft null bij een onbekende boeking", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await bookingSummary("onbekend")).toBeNull();
  });
});
