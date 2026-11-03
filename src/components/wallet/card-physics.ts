/**
 * Mass-spring-damper for the ROUT Card's tilt, tuned to feel like a 30 g
 * titanium card: it lags behind the hand, overshoots a hair and settles —
 * never jitters. Pure, no three.js or React, so it can be unit tested.
 */
export const CARD_MASS = 0.03; // kg
export const CARD_STIFFNESS = 1.15; // N·m/rad, pull toward the target angle
/** Damping ratio < 1 gives one soft overshoot; 0.78 reads as "heavy metal". */
export const CARD_DAMPING_RATIO = 0.78;
/** Gyro noise below this angle (rad) is ignored before it reaches the spring. */
export const GYRO_DEADZONE = 0.012;
const SUBSTEP = 1 / 240;

export type Spring = { x: number; v: number };

export function springDamping(m = CARD_MASS, k = CARD_STIFFNESS, zeta = CARD_DAMPING_RATIO): number {
  return 2 * zeta * Math.sqrt(k * m);
}

/** Semi-implicit Euler with fixed substeps: stable at 30, 60 or 120 Hz alike. */
export function stepSpring(s: Spring, target: number, dt: number, m = CARD_MASS, k = CARD_STIFFNESS, zeta = CARD_DAMPING_RATIO): Spring {
  const c = springDamping(m, k, zeta);
  let { x, v } = s;
  let left = Math.min(Math.max(dt, 0), 0.1);
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    const a = (-k * (x - target) - c * v) / m;
    v += a * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}

/** Low-pass + dead zone for raw gyro angles (rad). */
export function filterGyro(prev: number, raw: number, dt: number, cutoffHz = 6): number {
  if (Math.abs(raw - prev) < GYRO_DEADZONE) return prev;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = dt / (rc + dt);
  return prev + (raw - prev) * a;
}
