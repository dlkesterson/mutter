/**
 * Tests for annotation-based text cleanup
 */

import { describe, it, expect } from 'vitest';
import {
	parseAnnotations,
	applyAnnotations,
	applyAnnotationsHybrid,
	validateContentPreservation,
} from '@/services/text-cleanup-service';

describe('parseAnnotations', () => {
	it('parses HEADING annotations correctly', () => {
		const response = `HEADING:3:2:Morning Routine
HEADING:12:3:Technical Details`;

		const annotations = parseAnnotations(response);

		expect(annotations).toHaveLength(2);
		// Sorted descending by line number
		expect(annotations[0]).toEqual({
			type: 'heading',
			line: 12,
			level: 3,
			text: 'Technical Details',
		});
		expect(annotations[1]).toEqual({
			type: 'heading',
			line: 3,
			level: 2,
			text: 'Morning Routine',
		});
	});

	it('parses BREAK annotations correctly', () => {
		const response = `BREAK:5
BREAK:10`;

		const annotations = parseAnnotations(response);

		expect(annotations).toHaveLength(2);
		expect(annotations[0]).toEqual({ type: 'break', line: 10 });
		expect(annotations[1]).toEqual({ type: 'break', line: 5 });
	});

	it('parses mixed annotations correctly', () => {
		const response = `HEADING:1:2:Introduction
BREAK:5
HEADING:10:2:Main Content
BREAK:15`;

		const annotations = parseAnnotations(response);

		expect(annotations).toHaveLength(4);
		// Should be sorted descending
		expect(annotations[0].line).toBe(15);
		expect(annotations[1].line).toBe(10);
		expect(annotations[2].line).toBe(5);
		expect(annotations[3].line).toBe(1);
	});

	it('returns empty array for NO_CHANGES_NEEDED', () => {
		const response = 'NO_CHANGES_NEEDED';
		const annotations = parseAnnotations(response);
		expect(annotations).toHaveLength(0);
	});

	it('skips invalid annotation lines', () => {
		const response = `HEADING:3:2:Valid Heading
INVALID:line
HEADING:0:2:Invalid line number
HEADING:5:5:Invalid level
BREAK:10`;

		const annotations = parseAnnotations(response);

		expect(annotations).toHaveLength(2);
		expect(annotations[0].line).toBe(10);
		expect(annotations[1].line).toBe(3);
	});
});

describe('applyAnnotations', () => {
	it('inserts headings correctly', () => {
		const text = `Line one
Line two
Line three`;

		const annotations = parseAnnotations('HEADING:2:2:Section Title');
		const result = applyAnnotations(text, annotations);

		expect(result).toBe(`Line one

## Section Title
Line two
Line three`);
	});

	it('inserts breaks correctly', () => {
		const text = `Line one
Line two
Line three`;

		const annotations = parseAnnotations('BREAK:2');
		const result = applyAnnotations(text, annotations);

		expect(result).toBe(`Line one

Line two
Line three`);
	});

	it('applies multiple annotations correctly', () => {
		const text = `First paragraph content
Second line of first paragraph
Third paragraph starts here
Fourth line
Fifth line`;

		const response = `HEADING:1:2:Introduction
BREAK:3
HEADING:3:2:Main Content`;

		const annotations = parseAnnotations(response);
		const result = applyAnnotations(text, annotations);

		// Should have heading before line 1, break before line 3, and heading before line 3
		expect(result).toContain('## Introduction');
		expect(result).toContain('## Main Content');
	});

	it('returns original text when no annotations', () => {
		const text = 'Some text here';
		const annotations = parseAnnotations('NO_CHANGES_NEEDED');
		const result = applyAnnotations(text, annotations);

		expect(result).toBe(text);
	});

	it('preserves all original content', () => {
		const originalLines = [
			'First line of content',
			'Second line here',
			'Third line too',
			'Fourth line finally',
		];
		const text = originalLines.join('\n');

		const annotations = parseAnnotations(`HEADING:1:2:Section One
BREAK:3
HEADING:3:2:Section Two`);
		const result = applyAnnotations(text, annotations);

		// All original lines should still be present
		for (const line of originalLines) {
			expect(result).toContain(line);
		}
	});

	it('handles many BREAK annotations (wall of text scenario)', () => {
		const lines = Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1} of the transcription.`);
		const text = lines.join('\n');

		// Add breaks every 2-3 lines
		const response = `BREAK:3
BREAK:5
BREAK:7
BREAK:9`;

		const annotations = parseAnnotations(response);
		const result = applyAnnotations(text, annotations);

		// All original sentences should be present
		for (const line of lines) {
			expect(result).toContain(line);
		}

		// Should have 4 extra blank lines
		const originalLineCount = text.split('\n').length;
		const resultLineCount = result.split('\n').length;
		expect(resultLineCount).toBe(originalLineCount + 4);
	});

	it('skips heading annotation if heading already exists at target line', () => {
		const text = `# Title
## Existing Heading
Some content here`;

		// LLM suggests adding a heading at line 2, but there's already one there
		const annotations = parseAnnotations('HEADING:2:2:Existing Heading');
		const result = applyAnnotations(text, annotations);

		// Should NOT have duplicate heading
		const headingCount = (result.match(/^##\s+/gm) || []).length;
		expect(headingCount).toBe(1);
		expect(result).toBe(text); // Unchanged
	});

	it('skips heading annotation if heading exists on line before', () => {
		const text = `## Section Title
First paragraph content`;

		// LLM suggests adding heading before line 2, but line 1 is already a heading
		const annotations = parseAnnotations('HEADING:2:2:New Heading');
		const result = applyAnnotations(text, annotations);

		// Should NOT add duplicate heading
		const headingCount = (result.match(/^##\s+/gm) || []).length;
		expect(headingCount).toBe(1);
	});

	it('skips break annotation if blank line already exists', () => {
		const text = `First line

Second line`;

		// LLM suggests adding break at line 3, but line 2 is already blank
		const annotations = parseAnnotations('BREAK:3');
		const result = applyAnnotations(text, annotations);

		// Should NOT add extra blank line
		expect(result).toBe(text);
	});

	it('adds heading when no nearby heading exists', () => {
		const text = `Some content
More content
Even more content`;

		const annotations = parseAnnotations('HEADING:2:2:New Section');
		const result = applyAnnotations(text, annotations);

		// Should add the heading
		expect(result).toContain('## New Section');
	});
});

describe('applyAnnotationsHybrid', () => {
	it('splits long paragraph into sentences and applies breaks', () => {
		// Document with structure (heading) plus long paragraph that will be split
		const text = `# Title

First sentence here with some words. Second sentence here with more words. Third sentence here with even more words. Fourth sentence here to make it longer. Fifth sentence here for good measure.`;

		// Element indices: 0=heading, 1=blank, 2-6=sentences (5 sentences)
		const annotations = parseAnnotations('BREAK:4'); // Break before 4th sentence
		const result = applyAnnotationsHybrid(text, annotations);

		// Should have paragraph breaks
		expect(result).toContain('\n\n');
		// All content should be preserved
		expect(result).toContain('First sentence');
		expect(result).toContain('Fifth sentence');
		expect(result).toContain('# Title');
	});

	it('preserves existing headings', () => {
		const text = `# Main Title

Some long paragraph text that goes on for a while. More text here to make it longer. Even more text to ensure it gets split into sentences. And yet more text because we need many words.`;

		const annotations = parseAnnotations('BREAK:3');
		const result = applyAnnotationsHybrid(text, annotations);

		// Heading should be preserved exactly
		expect(result).toContain('# Main Title');
		// Content should be preserved
		expect(result).toContain('Some long paragraph');
	});

	it('preserves horizontal rules', () => {
		const text = `First paragraph with lots of words to make it long enough for sentence splitting to occur in the hybrid mode testing.

---

Second paragraph with lots of words to make it long enough for sentence splitting to occur in the hybrid mode testing.`;

		const annotations = parseAnnotations('BREAK:5');
		const result = applyAnnotationsHybrid(text, annotations);

		// HR should be preserved
		expect(result).toContain('---');
	});

	it('preserves all original content', () => {
		const text = `## Heading

First sentence in a long paragraph. Second sentence continues the thought. Third sentence adds more detail. Fourth sentence wraps things up nicely.`;

		const annotations = parseAnnotations('BREAK:4');
		const result = applyAnnotationsHybrid(text, annotations);

		// All sentences should be present
		expect(result).toContain('First sentence');
		expect(result).toContain('Second sentence');
		expect(result).toContain('Third sentence');
		expect(result).toContain('Fourth sentence');
		expect(result).toContain('## Heading');
	});
});

describe('validateContentPreservation', () => {
	it('accepts valid structure-only output', () => {
		const original = 'Word '.repeat(100).trim();
		const cleaned = original + '\n## Heading\n' + original; // Same content plus heading

		const result = validateContentPreservation(
			original,
			cleaned,
			'structure-only'
		);

		expect(result.valid).toBe(true);
	});

	it('rejects structure-only with content loss', () => {
		const original = 'Word '.repeat(100).trim();
		const cleaned = 'Word '.repeat(50).trim(); // 50% content loss

		const result = validateContentPreservation(
			original,
			cleaned,
			'structure-only'
		);

		expect(result.valid).toBe(false);
		expect(result.message).toContain('Content loss');
	});

	it('accepts valid filler-removal output', () => {
		const original = 'Word '.repeat(100).trim();
		const cleaned = 'Word '.repeat(80).trim(); // 20% loss is OK

		const result = validateContentPreservation(
			original,
			cleaned,
			'filler-removal'
		);

		expect(result.valid).toBe(true);
	});

	it('rejects filler-removal with excessive loss', () => {
		const original = 'Word '.repeat(100).trim();
		const cleaned = 'Word '.repeat(50).trim(); // 50% loss exceeds 30% threshold

		const result = validateContentPreservation(
			original,
			cleaned,
			'filler-removal'
		);

		expect(result.valid).toBe(false);
		expect(result.message).toContain('Excessive content loss');
	});

	it('handles empty original text', () => {
		const result = validateContentPreservation('', 'output', 'filler-removal');
		expect(result.valid).toBe(true);
	});
});
