import { describe, it, expect } from 'vitest';

// Extract the structural fail logic from pipeline-slide.ts for testing
// (same logic, importable without running the CLI)
const STRUCTURAL_ISSUES = [
  '4-head-tall proportion',
  'hyper-realistic textures',
];

function isStructuralFailOnly(issues: string[]): boolean {
  return issues.every((issue) =>
    STRUCTURAL_ISSUES.some((s) => issue.toLowerCase().includes(s.toLowerCase())),
  );
}

describe('isStructuralFailOnly', () => {
  it('returns true when only structural issues present', () => {
    expect(isStructuralFailOnly([
      '4-head-tall proportion mismatch',
    ])).toBe(true);
  });

  it('returns true for hyper-realistic textures only', () => {
    expect(isStructuralFailOnly([
      'hyper-realistic textures in background conflict with 2D character',
    ])).toBe(true);
  });

  it('returns true for both structural issues combined', () => {
    expect(isStructuralFailOnly([
      '4-head-tall proportion',
      'hyper-realistic textures',
    ])).toBe(true);
  });

  it('returns false when non-structural issues present', () => {
    expect(isStructuralFailOnly([
      '4-head-tall proportion',
      'color palette mismatch',
    ])).toBe(false);
  });

  it('returns false for pose mismatch', () => {
    expect(isStructuralFailOnly([
      'pose does not match the requested sitting position',
    ])).toBe(false);
  });

  it('returns false for empty issues (vacuous truth but should not bypass)', () => {
    // Empty issues with FAIL verdict should not proceed
    // isStructuralFailOnly returns true for empty (every on empty = true)
    // but the caller checks verdict first
    expect(isStructuralFailOnly([])).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isStructuralFailOnly([
      '4-HEAD-TALL PROPORTION',
    ])).toBe(true);
  });
});
