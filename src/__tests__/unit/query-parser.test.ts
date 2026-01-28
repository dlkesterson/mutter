/**
 * Query Parser Unit Tests
 *
 * Tests the DSL parser for correctness
 */

import { describe, it, expect } from 'vitest';
import { parseQuery, validateQuery, describeQuery } from '@/query/parser';

describe('Query Parser', () => {
  describe('parseQuery', () => {
    it('parses empty query', () => {
      const result = parseQuery('');
      expect(result.terms).toHaveLength(0);
      expect(result.raw).toBe('');
    });

    it('parses single filter term', () => {
      const result = parseQuery('tag:project');
      expect(result.terms).toHaveLength(1);
      expect(result.terms[0]).toEqual({
        type: 'filter',
        key: 'tag',
        operator: '=',
        value: 'project',
      });
    });

    it('parses multiple filter terms', () => {
      const result = parseQuery('tag:project linked:Meeting');
      expect(result.terms).toHaveLength(2);
      expect(result.terms[0]).toMatchObject({ key: 'tag', value: 'project' });
      expect(result.terms[1]).toMatchObject({ key: 'linked', value: 'Meeting' });
    });

    it('parses comparison operators', () => {
      const tests = [
        { query: 'created:>2024-01-01', expected: { operator: '>', value: '2024-01-01' } },
        { query: 'created:>=2024-01-01', expected: { operator: '>=', value: '2024-01-01' } },
        { query: 'created:<2024-01-01', expected: { operator: '<', value: '2024-01-01' } },
        { query: 'created:<=2024-01-01', expected: { operator: '<=', value: '2024-01-01' } },
      ];

      for (const { query, expected } of tests) {
        const result = parseQuery(query);
        expect(result.terms[0]).toMatchObject(expected);
      }
    });

    it('parses quoted text terms', () => {
      const result = parseQuery('"exact phrase"');
      expect(result.terms).toHaveLength(1);
      expect(result.terms[0]).toEqual({
        type: 'text',
        value: 'exact phrase',
        exact: true,
      });
    });

    it('parses unquoted text terms', () => {
      const result = parseQuery('meeting notes');
      expect(result.terms).toHaveLength(2);
      expect(result.terms[0]).toEqual({ type: 'text', value: 'meeting', exact: false });
      expect(result.terms[1]).toEqual({ type: 'text', value: 'notes', exact: false });
    });

    it('parses mixed filters and text', () => {
      const result = parseQuery('tag:project "important" deadline');
      expect(result.terms).toHaveLength(3);
      expect(result.terms[0].type).toBe('filter');
      expect(result.terms[1]).toMatchObject({ type: 'text', exact: true });
      expect(result.terms[2]).toMatchObject({ type: 'text', exact: false });
    });

    it('strips [[wikilink]] syntax from linked filter', () => {
      // Single-word wikilink
      const result = parseQuery('linked:[[Meeting]]');
      expect(result.terms[0]).toMatchObject({
        key: 'linked',
        value: 'Meeting',
      });
    });

    it('handles multi-word values with underscores', () => {
      // Multi-word values can use underscores or hyphens
      const result = parseQuery('linked:Meeting_Notes');
      expect(result.terms[0]).toMatchObject({
        key: 'linked',
        value: 'Meeting_Notes',
      });
    });

    it('parses dot notation for scoped fields', () => {
      const result = parseQuery('project.status:active');
      expect(result.terms[0]).toMatchObject({
        key: 'project.status',
        value: 'active',
      });
    });

    it('parses has: filter', () => {
      const result = parseQuery('has:tags');
      expect(result.terms[0]).toMatchObject({
        key: 'has',
        value: 'tags',
      });
    });

    it('handles unterminated quotes', () => {
      const result = parseQuery('"unterminated');
      expect(result.terms).toHaveLength(1);
      expect(result.terms[0]).toMatchObject({
        type: 'text',
        value: 'unterminated',
        exact: true,
      });
    });
  });

  describe('validateQuery', () => {
    it('passes for valid query', () => {
      const parsed = parseQuery('tag:project');
      const errors = validateQuery(parsed);
      expect(errors).toHaveLength(0);
    });

    it('validates date format for created filter', () => {
      const parsed = parseQuery('created:>invalid-date');
      const errors = validateQuery(parsed);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid date format');
    });

    it('validates date format for updated filter', () => {
      const parsed = parseQuery('updated:>=not-a-date');
      const errors = validateQuery(parsed);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid date format');
    });

    it('accepts valid date format', () => {
      const parsed = parseQuery('created:>2024-01-15');
      const errors = validateQuery(parsed);
      expect(errors).toHaveLength(0);
    });

    it('skips date validation for equality operator', () => {
      const parsed = parseQuery('created:today');
      const errors = validateQuery(parsed);
      // Equality operator doesn't require YYYY-MM-DD format
      expect(errors).toHaveLength(0);
    });
  });

  describe('describeQuery', () => {
    it('describes empty query', () => {
      const parsed = parseQuery('');
      expect(describeQuery(parsed)).toBe('All notes');
    });

    it('describes tag filter', () => {
      const parsed = parseQuery('tag:work');
      expect(describeQuery(parsed)).toBe('Notes tagged #work');
    });

    it('describes linked filter', () => {
      const parsed = parseQuery('linked:Meeting');
      expect(describeQuery(parsed)).toBe('Notes linking to "Meeting"');
    });

    it('describes from filter', () => {
      const parsed = parseQuery('from:Index');
      expect(describeQuery(parsed)).toBe('Notes linked from "Index"');
    });

    it('describes created filter', () => {
      const parsed = parseQuery('created:>2024-01-01');
      expect(describeQuery(parsed)).toBe('Notes created > 2024-01-01');
    });

    it('describes has filter', () => {
      const parsed = parseQuery('has:links');
      expect(describeQuery(parsed)).toBe('Notes with links');
    });

    it('describes multiple terms with and', () => {
      const parsed = parseQuery('tag:project created:>2024-01-01');
      expect(describeQuery(parsed)).toContain(' and ');
    });

    it('describes text terms', () => {
      const parsed = parseQuery('"meeting notes"');
      expect(describeQuery(parsed)).toBe('Notes "meeting notes"');
    });
  });
});
