/**
 * Link Parser
 *
 * Parses markdown content to extract:
 * - Wiki links: [[Note Name]] or [[Note Name#blockId]]
 * - Embeds: ![[Note Name]] or ![[Note Name#blockId]]
 * - Aliases: [[Note Name|Display Text]]
 */

/**
 * Parsed link information
 */
export interface ParsedLink {
  /** Original text including brackets: "[[Note Name#blockId]]" */
  raw: string;
  /** Note name or path: "Note Name" */
  target: string;
  /** Block reference if present: "blockId" or null */
  blockId: string | null;
  /** Link type */
  type: 'wiki-link' | 'embed';
  /** Position in source text */
  position: {
    start: number;
    end: number;
  };
  /** Display alias if present */
  alias: string | null;
}

/**
 * Regex patterns for link extraction
 *
 * Wiki link format: [[target#blockId|alias]]
 * - target: required, note name or path
 * - #blockId: optional, block reference
 * - |alias: optional, display text
 *
 * Embed format: ![[target#blockId|alias]]
 * - Same as wiki link but prefixed with !
 */

// Matches [[target#blockId|alias]] - captures target, optional blockId, ignores alias
const WIKI_LINK_REGEX = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;

// Matches ![[target#blockId|alias]] - same structure with ! prefix
const EMBED_REGEX = /!\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;

// Matches alias portion separately for extraction
const ALIAS_REGEX = /\[\[(?:[^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/;

/**
 * Parse all links from markdown content
 *
 * @param content - Markdown text to parse
 * @returns Array of parsed links with metadata
 */
export function parseLinks(content: string): ParsedLink[] {
  const links: ParsedLink[] = [];

  // Parse embeds first (they start with !)
  for (const match of content.matchAll(EMBED_REGEX)) {
    const raw = match[0];
    const target = match[1]?.trim();
    const blockId = match[2]?.trim() || null;

    if (!target) continue;

    // Extract alias if present
    const aliasMatch = raw.match(ALIAS_REGEX);
    const alias = aliasMatch?.[1]?.trim() || null;

    links.push({
      raw,
      target,
      blockId,
      type: 'embed',
      position: {
        start: match.index!,
        end: match.index! + raw.length,
      },
      alias,
    });
  }

  // Parse wiki links (exclude embeds by checking for ! prefix)
  for (const match of content.matchAll(WIKI_LINK_REGEX)) {
    const index = match.index!;

    // Skip if this is actually an embed (preceded by !)
    if (index > 0 && content[index - 1] === '!') {
      continue;
    }

    const raw = match[0];
    const target = match[1]?.trim();
    const blockId = match[2]?.trim() || null;

    if (!target) continue;

    // Extract alias if present
    const aliasMatch = raw.match(ALIAS_REGEX);
    const alias = aliasMatch?.[1]?.trim() || null;

    links.push({
      raw,
      target,
      blockId,
      type: 'wiki-link',
      position: {
        start: index,
        end: index + raw.length,
      },
      alias,
    });
  }

  // Sort by position
  return links.sort((a, b) => a.position.start - b.position.start);
}

/**
 * Extract unique link targets (for simple link array)
 * Returns just the note names without block IDs
 */
export function extractLinkTargets(content: string): string[] {
  const links = parseLinks(content);
  const targets = new Set(links.map((l) => l.target));
  return Array.from(targets).sort();
}

/**
 * Check if a string looks like a wiki link
 */
export function isWikiLink(text: string): boolean {
  return /^\[\[[^\]]+\]\]$/.test(text);
}

/**
 * Check if a string looks like an embed
 */
export function isEmbed(text: string): boolean {
  return /^!\[\[[^\]]+\]\]$/.test(text);
}

/**
 * Create a wiki link string
 */
export function createWikiLink(
  target: string,
  blockId?: string,
  alias?: string
): string {
  let link = `[[${target}`;
  if (blockId) link += `#${blockId}`;
  if (alias) link += `|${alias}`;
  link += ']]';
  return link;
}

/**
 * Create an embed string
 */
export function createEmbed(
  target: string,
  blockId?: string,
  alias?: string
): string {
  return '!' + createWikiLink(target, blockId, alias);
}

/**
 * Parse a single link string
 * Returns null if not a valid link
 */
export function parseSingleLink(linkText: string): ParsedLink | null {
  const isEmbedLink = linkText.startsWith('!');
  const normalizedText = isEmbedLink ? linkText : linkText;

  const links = parseLinks(normalizedText);
  return links[0] || null;
}
