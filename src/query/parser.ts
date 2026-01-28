/**
 * Query DSL Parser for Mutter
 *
 * Parses structured queries against the vault:
 *   tag:work linked:[[Meeting]]
 *   created:>2024-01-01 "exact phrase"
 */

export type FilterOperator = '=' | '>' | '<' | '>=' | '<=';

export interface FilterTerm {
  type: 'filter';
  key: string;
  operator: FilterOperator;
  value: string;
}

export interface TextTerm {
  type: 'text';
  value: string;
  exact: boolean; // true if quoted
}

export type QueryTerm = FilterTerm | TextTerm;

export interface ParsedQuery {
  terms: QueryTerm[];
  raw: string;
}

/**
 * Known filter keys with special handling
 */
const KNOWN_FILTERS = new Set([
  'tag', // Markdown tag
  'linked', // Links to note
  'from', // Links from note
  'created', // Creation date
  'updated', // Update date
  'has', // Has property (has:blocks, has:links)
]);

/**
 * Tokenize query string, respecting quoted strings
 */
function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === '"') {
      if (inQuotes) {
        // End of quoted string
        tokens.push(`"${current}"`);
        current = '';
        inQuotes = false;
      } else {
        // Start of quoted string
        if (current) tokens.push(current);
        current = '';
        inQuotes = true;
      }
    } else if (char === ' ' && !inQuotes) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Handle unterminated quote
  if (current) {
    if (inQuotes) {
      tokens.push(`"${current}"`);
    } else {
      tokens.push(current);
    }
  }

  return tokens;
}

/**
 * Parse a filter token (key:value or key:>value)
 */
function parseFilterToken(token: string): FilterTerm | null {
  const colonIdx = token.indexOf(':');
  if (colonIdx === -1) return null;

  const key = token.slice(0, colonIdx).toLowerCase();
  let rest = token.slice(colonIdx + 1);

  // Skip empty values
  if (!rest) return null;

  // Check for comparison operator
  let operator: FilterOperator = '=';
  if (rest.startsWith('>=')) {
    operator = '>=';
    rest = rest.slice(2);
  } else if (rest.startsWith('<=')) {
    operator = '<=';
    rest = rest.slice(2);
  } else if (rest.startsWith('>')) {
    operator = '>';
    rest = rest.slice(1);
  } else if (rest.startsWith('<')) {
    operator = '<';
    rest = rest.slice(1);
  }

  // Handle [[wikilink]] syntax for linked filter
  if (key === 'linked' || key === 'from') {
    rest = rest.replace(/^\[\[|\]\]$/g, '');
  }

  return {
    type: 'filter',
    key,
    operator,
    value: rest,
  };
}

/**
 * Parse a text token (plain word or "quoted phrase")
 */
function parseTextToken(token: string): TextTerm {
  if (token.startsWith('"') && token.endsWith('"')) {
    return {
      type: 'text',
      value: token.slice(1, -1),
      exact: true,
    };
  }

  return {
    type: 'text',
    value: token,
    exact: false,
  };
}

/**
 * Parse a query string into structured terms
 */
export function parseQuery(query: string): ParsedQuery {
  const tokens = tokenize(query.trim());
  const terms: QueryTerm[] = [];

  for (const token of tokens) {
    const filter = parseFilterToken(token);
    // Accept known filters or any key:value pattern
    if (filter && KNOWN_FILTERS.has(filter.key)) {
      terms.push(filter);
    } else if (token.includes(':') && parseFilterToken(token)) {
      // Accept custom key:value filters for extensibility
      const customFilter = parseFilterToken(token);
      if (customFilter) {
        terms.push(customFilter);
      }
    } else {
      terms.push(parseTextToken(token));
    }
  }

  return {
    terms,
    raw: query,
  };
}

/**
 * Validate query and return any errors
 */
export function validateQuery(parsed: ParsedQuery): string[] {
  const errors: string[] = [];

  for (const term of parsed.terms) {
    if (term.type === 'filter') {
      // Check date format for date filters
      if (
        (term.key === 'created' || term.key === 'updated') &&
        term.operator !== '='
      ) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(term.value)) {
          errors.push(`Invalid date format for ${term.key}: use YYYY-MM-DD`);
        }
      }

      // Check for empty values
      if (!term.value) {
        errors.push(`Empty value for filter "${term.key}"`);
      }
    }
  }

  return errors;
}

/**
 * Get a human-readable description of a parsed query
 */
export function describeQuery(parsed: ParsedQuery): string {
  if (parsed.terms.length === 0) {
    return 'All notes';
  }

  const parts: string[] = [];

  for (const term of parsed.terms) {
    if (term.type === 'filter') {
      switch (term.key) {
        case 'tag':
          parts.push(`tagged #${term.value}`);
          break;
        case 'linked':
          parts.push(`linking to "${term.value}"`);
          break;
        case 'from':
          parts.push(`linked from "${term.value}"`);
          break;
        case 'created':
          parts.push(`created ${term.operator} ${term.value}`);
          break;
        case 'updated':
          parts.push(`updated ${term.operator} ${term.value}`);
          break;
        case 'has':
          parts.push(`with ${term.value}`);
          break;
        default:
          parts.push(`${term.key} ${term.operator} ${term.value}`);
      }
    } else {
      parts.push(term.exact ? `"${term.value}"` : term.value);
    }
  }

  return `Notes ${parts.join(' and ')}`;
}
