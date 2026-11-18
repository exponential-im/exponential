import { describe, it, expect } from 'vitest';
import { matchProductTabs, PRODUCT_NAV_LIMIT } from '../productTabNav';

const clear = { id: 'p1', name: 'CLEAR', slug: 'clear' };
const expo = { id: 'p2', name: 'Exponential', slug: 'exponential' };

const labels = (q: string, products = [clear, expo]) =>
  matchProductTabs(q, products, 'clear').map((r) => r.label);

describe('matchProductTabs', () => {
  it('offers every product its Cycles tab for "cycles"', () => {
    const rows = matchProductTabs('cycles', [clear, expo], 'clear');
    expect(rows.map((r) => r.label)).toEqual(['CLEAR - Cycles', 'Exponential - Cycles']);
    expect(rows[0]?.href).toBe('/w/clear/products/clear/cycles');
  });

  it('matches a tab by prefix and by keyword', () => {
    expect(labels('cyc', [clear])).toEqual(['CLEAR - Cycles']);
    expect(labels('tickets', [clear])).toEqual(['CLEAR - Backlog']);
    expect(labels('retrospectives', [clear])).toEqual(['CLEAR - Retro']);
  });

  it('narrows to one product when the query names it', () => {
    expect(labels('clear cycles')).toEqual(['CLEAR - Cycles']);
    expect(labels('cycles clear')).toEqual(['CLEAR - Cycles']);
  });

  it('lists no tabs for a product name alone', () => {
    expect(labels('clear')).toEqual([]);
    expect(labels('')).toEqual([]);
  });

  it('never offers the Overview tab', () => {
    expect(labels('overview')).toEqual([]);
  });

  it('caps the rows a short query produces', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, slug: `p${i}` }));
    expect(matchProductTabs('c', many, 'clear')).toHaveLength(PRODUCT_NAV_LIMIT);
  });
});
