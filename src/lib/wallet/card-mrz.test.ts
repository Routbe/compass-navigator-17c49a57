import { describe, expect, it } from "vitest";
import { cardMrz, mrzCheckDigit } from "./card-mrz";

describe("card MRZ", () => {
  it("uses the ICAO 7-3-1 check digit", () => {
    // ICAO 9303 specimen document number.
    expect(mrzCheckDigit("L898902C3")).toBe(6);
  });

  it("is three lines of exactly 30 MRZ characters", () => {
    const lines = cardMrz({ sovereignId: "RT-7K2-9QX", handle: "Léna.dev", space: "root" });
    expect(lines).toHaveLength(3);
    lines.forEach((l) => expect(l).toMatch(/^[A-Z0-9<]{30}$/));
    expect(lines[2]).toContain("LENA<DEV");
  });
});
