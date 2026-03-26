import { describe, expect, it } from 'vitest';
import { extractNormalizedTerm, normalizeTerm } from '../../src/utils/termNoteUtils';

describe('normalizeTerm', () => {
  it('normalizes by trim + lowercase only', () => {
    expect(normalizeTerm(' User_Table ')).toBe('user_table');
  });

  it('does not fuzzy match substrings', () => {
    expect(normalizeTerm('user')).not.toBe(normalizeTerm('user_table'));
  });

  it('rejects empty selections', () => {
    expect(extractNormalizedTerm('   ')).toBeUndefined();
  });
});
