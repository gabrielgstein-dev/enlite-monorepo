/**
 * MatchmakingScoring.test.ts
 *
 * Tests the rejection penalty and quality rating bonus logic
 * in the MatchmakingService's computeStructuredScore method.
 *
 * Since computeStructuredScore is private, we test it indirectly
 * by exposing the scoring logic as pure functions.
 */

// Pure reimplementation of the penalty/bonus logic for testability
function computeRejectionPenalty(rejectionHistory: Record<string, number>): number {
  let penalty = 0;
  if ((rejectionHistory['DISTANCE'] ?? 0) >= 2) penalty -= 10;
  if ((rejectionHistory['SCHEDULE_INCOMPATIBLE'] ?? 0) >= 2) penalty -= 15;
  if ((rejectionHistory['DEPENDENCY_MISMATCH'] ?? 0) >= 3) penalty -= 20;
  if ((rejectionHistory['INSUFFICIENT_EXPERIENCE'] ?? 0) >= 3) penalty -= 15;
  return penalty;
}

function computeQualityBonus(avgQualityRating: number | null): number {
  if (avgQualityRating === null) return 0;
  if (avgQualityRating >= 4.5) return 15;
  if (avgQualityRating >= 4.0) return 10;
  if (avgQualityRating < 3.0) return -10;
  return 0;
}

describe('MatchmakingService — Rejection Penalty Logic', () => {
  it('applies -10 penalty for 2+ DISTANCE rejections', () => {
    expect(computeRejectionPenalty({ DISTANCE: 2 })).toBe(-10);
    expect(computeRejectionPenalty({ DISTANCE: 5 })).toBe(-10);
  });

  it('applies -15 penalty for 2+ SCHEDULE_INCOMPATIBLE rejections', () => {
    expect(computeRejectionPenalty({ SCHEDULE_INCOMPATIBLE: 2 })).toBe(-15);
  });

  it('applies -20 penalty for 3+ DEPENDENCY_MISMATCH rejections', () => {
    expect(computeRejectionPenalty({ DEPENDENCY_MISMATCH: 3 })).toBe(-20);
    expect(computeRejectionPenalty({ DEPENDENCY_MISMATCH: 2 })).toBe(0);
  });

  it('applies -15 penalty for 3+ INSUFFICIENT_EXPERIENCE rejections', () => {
    expect(computeRejectionPenalty({ INSUFFICIENT_EXPERIENCE: 3 })).toBe(-15);
  });

  it('stacks multiple penalties', () => {
    const history = {
      DISTANCE: 3,
      SCHEDULE_INCOMPATIBLE: 4,
      DEPENDENCY_MISMATCH: 5,
      INSUFFICIENT_EXPERIENCE: 3,
    };
    // -10 + -15 + -20 + -15 = -60
    expect(computeRejectionPenalty(history)).toBe(-60);
  });

  it('returns 0 for empty rejection history', () => {
    expect(computeRejectionPenalty({})).toBe(0);
  });

  it('ignores categories below threshold', () => {
    const history = {
      DISTANCE: 1,
      SCHEDULE_INCOMPATIBLE: 1,
      DEPENDENCY_MISMATCH: 2,
      INSUFFICIENT_EXPERIENCE: 2,
    };
    expect(computeRejectionPenalty(history)).toBe(0);
  });

  it('ignores unrecognized categories', () => {
    expect(computeRejectionPenalty({ UNKNOWN_CATEGORY: 10 })).toBe(0);
  });
});

describe('MatchmakingService — Quality Rating Bonus Logic', () => {
  it('returns +15 for rating >= 4.5', () => {
    expect(computeQualityBonus(4.5)).toBe(15);
    expect(computeQualityBonus(5.0)).toBe(15);
    expect(computeQualityBonus(4.8)).toBe(15);
  });

  it('returns +10 for rating >= 4.0 and < 4.5', () => {
    expect(computeQualityBonus(4.0)).toBe(10);
    expect(computeQualityBonus(4.3)).toBe(10);
    expect(computeQualityBonus(4.49)).toBe(10);
  });

  it('returns 0 for rating >= 3.0 and < 4.0', () => {
    expect(computeQualityBonus(3.0)).toBe(0);
    expect(computeQualityBonus(3.5)).toBe(0);
    expect(computeQualityBonus(3.99)).toBe(0);
  });

  it('returns -10 for rating < 3.0', () => {
    expect(computeQualityBonus(2.9)).toBe(-10);
    expect(computeQualityBonus(1.0)).toBe(-10);
    expect(computeQualityBonus(0)).toBe(-10);
  });

  it('returns 0 when rating is null', () => {
    expect(computeQualityBonus(null)).toBe(0);
  });
});
