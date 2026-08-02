import { describe, expect, it } from "vitest";
import { gate, gateFromInterviewer } from "../src/scoring/scoring.js";

const T = { pass: 70, review: 50 };

describe("scoring gate", () => {
  it("passes a score at or above the pass threshold", () => {
    expect(gate(70, T)).toBe("pass");
    expect(gate(95, T)).toBe("pass");
  });

  it("routes a mid score to review", () => {
    expect(gate(50, T)).toBe("review");
    expect(gate(69, T)).toBe("review");
  });

  it("fails a score below the review threshold", () => {
    expect(gate(49, T)).toBe("fail");
    expect(gate(0, T)).toBe("fail");
  });

  it("treats a missing/null score as review (manual fallback)", () => {
    expect(gate(null, T)).toBe("review");
    expect(gate(undefined, T)).toBe("review");
  });

  it("respects configurable thresholds (no magic numbers)", () => {
    const strict = { pass: 90, review: 80 };
    expect(gate(85, strict)).toBe("review");
    expect(gate(90, strict)).toBe("pass");
    expect(gate(79, strict)).toBe("fail");
  });

  it("maps interviewer decisions directly", () => {
    expect(gateFromInterviewer("pass")).toBe("pass");
    expect(gateFromInterviewer("fail")).toBe("fail");
  });
});
