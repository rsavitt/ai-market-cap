import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  CATEGORY_COLORS,
} from '../categories';

describe('category mappings', () => {
  it('CATEGORY_LABELS covers every category', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_LABELS[cat], `missing label for "${cat}"`).toBeTruthy();
    }
  });

  it('CATEGORY_SHORT_LABELS covers every category', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_SHORT_LABELS[cat], `missing short label for "${cat}"`).toBeTruthy();
    }
  });

  it('CATEGORY_COLORS covers every category', () => {
    for (const cat of CATEGORIES) {
      expect(CATEGORY_COLORS[cat], `missing color for "${cat}"`).toBeTruthy();
    }
  });

  it('no extra keys in CATEGORY_LABELS beyond CATEGORIES', () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('no extra keys in CATEGORY_SHORT_LABELS beyond CATEGORIES', () => {
    expect(Object.keys(CATEGORY_SHORT_LABELS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('no extra keys in CATEGORY_COLORS beyond CATEGORIES', () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...CATEGORIES].sort());
  });
});
