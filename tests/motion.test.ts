import { describe, expect, it } from "vitest";
import {
  dampingFactor,
  pointerToUv,
} from "../src/components/canvas/motion";

describe("aurora pointer mapping", () => {
  const bounds = { left: 120, top: -80, width: 1000, height: 500 };
  it("maps a scrolled, offset surface to bottom-left shader coordinates", () => {
    expect(pointerToUv(620, 170, bounds)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointerToUv(120, -80, bounds)).toEqual({ x: 0, y: 1 });
    expect(pointerToUv(1120, 420, bounds)).toEqual({ x: 1, y: 0 });
  });
  it("releases influence outside the actual surface", () => {
    expect(pointerToUv(119, 100, bounds)).toBeNull();
    expect(pointerToUv(620, 421, bounds)).toBeNull();
  });
  it("ignores unavailable geometry and invalid coordinates", () => {
    expect(pointerToUv(0, 0, { ...bounds, width: 0 })).toBeNull();
    expect(pointerToUv(NaN, 0, bounds)).toBeNull();
  });
  it("damps consistently across 60 and 120 Hz", () => {
    const at60 = 1 - dampingFactor(1 / 60);
    const at120 = 1 - dampingFactor(1 / 120);
    expect(at120 * at120).toBeCloseTo(at60, 12);
    expect(dampingFactor(-1)).toBe(0);
    expect(dampingFactor(30)).toBe(dampingFactor(0.05));
  });
});

