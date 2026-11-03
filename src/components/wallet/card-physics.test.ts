import { describe, expect, it } from "vitest";
import { CARD_DAMPING_RATIO, filterGyro, stepSpring, type Spring } from "./card-physics";

function run(dt: number, seconds: number) {
  let s: Spring = { x: 0, v: 0 };
  let peak = 0;
  for (let t = 0; t < seconds; t += dt) {
    s = stepSpring(s, 1, dt);
    peak = Math.max(peak, s.x);
  }
  return { s, peak };
}

describe("card physics", () => {
  it("is under-damped: one soft overshoot, then it settles on target", () => {
    expect(CARD_DAMPING_RATIO).toBeLessThan(1);
    const { s, peak } = run(1 / 60, 3);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.15);
    expect(Math.abs(s.x - 1)).toBeLessThan(0.01);
  });

  it("feels the same at 60 Hz and 120 Hz", () => {
    expect(Math.abs(run(1 / 60, 0.5).s.x - run(1 / 120, 0.5).s.x)).toBeLessThan(0.02);
  });

  it("has weight: it lags behind the hand at first", () => {
    expect(run(1 / 60, 0.1).s.x).toBeLessThan(0.5);
  });

  it("ignores gyro jitter inside the dead zone", () => {
    expect(filterGyro(0.2, 0.205, 1 / 60)).toBe(0.2);
    expect(filterGyro(0.2, 0.5, 1 / 60)).toBeGreaterThan(0.2);
  });
});
