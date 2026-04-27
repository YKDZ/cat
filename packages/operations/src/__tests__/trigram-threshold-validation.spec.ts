import { describe, it, expect } from "vitest";

// Simulated: hardcode 276 Minecraft term lengths for offline validation
// In practice, read from the Minecraft glossary seed data
const SAMPLE_TERM_LENGTHS = [
  // Short terms (2-4 chars) -- the problem category
  3, 3, 3, 4, 4, 4, 4, 4, 3, 3,
  // Medium terms (5-10 chars)
  5, 5, 6, 6, 7, 7, 8, 8, 9, 10,
  // Long terms (11+ chars)
  11, 12, 13, 14, 15, 16, 17, 18, 20, 25,
];

const formula = (termLength: number, coefficient: number): number =>
  Math.max(0.3, 1.0 - termLength * coefficient);

describe("trigram threshold formula validation", () => {
  it("computes thresholds for all length buckets with coefficient 0.15", () => {
    const buckets = new Map<number, number[]>();
    for (const len of SAMPLE_TERM_LENGTHS) {
      const threshold = formula(len, 0.15);
      const bucket = buckets.get(len) ?? [];
      bucket.push(threshold);
      buckets.set(len, bucket);
    }
    // Log distribution
    for (const [len, values] of buckets) {
      console.log(
        `Length ${len}: threshold=${values[0].toFixed(2)}, count=${values.length}`,
      );
    }

    // Verify: 3-char terms should have threshold >= 0.5
    expect(formula(3, 0.15)).toBeGreaterThanOrEqual(0.5);
    // Verify: 4-char terms should have threshold >= 0.35
    expect(formula(4, 0.15)).toBeGreaterThanOrEqual(0.35);
    // Verify: 5+ char terms keep default 0.3
    expect(formula(5, 0.15)).toBe(0.3);
  });

  it("computes thresholds with coefficient 0.10 for comparison", () => {
    // If 2-3 char recall drops >10% with 0.15, use 0.10 for 2-3 char
    expect(formula(2, 0.1)).toBeGreaterThanOrEqual(0.7);
    expect(formula(3, 0.1)).toBeGreaterThanOrEqual(0.65);
  });
});
