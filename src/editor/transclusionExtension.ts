/**
 * Transclusion Extension for CodeMirror
 *
 * Renders ![[Note Name#blockId]] embeds as live previews of the referenced content.
 * Features:
 * - Async content loading with loading state
 * - Error handling for missing notes/blocks
 * - Edit and Jump to source actions
 * - Content cached in state to avoid reloading
 */

import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import { StateField, StateEffect, Range } from '@codemirror/state';
import { parseLinks, ParsedLink } from '@/graph/linkParser';

/**
 * Effect to update transclusion content after async load
 */
export const updateTransclusionContent = StateEffect.define<{
  embedId: string;
  content: string;
}>();

/**
 * Effect to mark an embed as errored
 */
export const setTransclusionError = StateEffect.define<{
  embedId: string;
  error: string;
}>();

/**
 * Widget that renders transcluded content
 *
 * Uses safe DOM methods (no innerHTML) for security.
 * Content is displayed as preformatted text.
 */
class TransclusionWidget extends WidgetType {
  constructor(
    private embed: ParsedLink,
    private content: string | null,
    private loading: boolean,
    private error: string | null,
    private onEdit: () => void,
    private onJump: () => void
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-transclusion';

    // Loading state
    if (this.loading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'cm-transclusion-loading';
      const loadingSpan = document.createElement('span');
      loadingSpan.className = 'animate-pulse';
      loadingSpan.textContent = 'Loading embed...';
      loadingDiv.appendChild(loadingSpan);
      wrapper.appendChild(loadingDiv);
      return wrapper;
    }

    // Error state
    if (this.error) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'cm-transclusion-error';
      const errorSpan = document.createElement('span');
      errorSpan.textContent = '[!] ' + this.error;
      errorDiv.appendChild(errorSpan);
      wrapper.appendChild(errorDiv);
      return wrapper;
    }

    // Content loaded
    if (this.content) {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'cm-transclusion-content';

      // Source reference header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'cm-transclusion-header';
      const sourceSpan = document.createElement('span');
      sourceSpan.className = 'cm-transclusion-source';
      sourceSpan.textContent = this.embed.blockId
        ? `${this.embed.target}#${this.embed.blockId}`
        : this.embed.target;
      headerDiv.appendChild(sourceSpan);
      contentDiv.appendChild(headerDiv);

      // Body content
      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'cm-transclusion-body';
      // Use textContent for safety - render as preformatted text
      const pre = document.createElement('pre');
      pre.className = 'cm-transclusion-text';
      pre.textContent = this.content;
      bodyDiv.appendChild(pre);
      contentDiv.appendChild(bodyDiv);

      // Action buttons
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'cm-transclusion-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'cm-transclusion-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onEdit();
      });

      const jumpBtn = document.createElement('button');
      jumpBtn.className = 'cm-transclusion-jump';
      jumpBtn.textContent = 'Jump to source';
      jumpBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onJump();
      });

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(jumpBtn);
      contentDiv.appendChild(actionsDiv);
      wrapper.appendChild(contentDiv);
    }

    return wrapper;
  }

  eq(other: TransclusionWidget): boolean {
    return (
      this.embed.raw === other.embed.raw &&
      this.content === other.content &&
      this.loading === other.loading &&
      this.error === other.error
    );
  }

  ignoreEvent(): boolean {
    // Don't ignore events - allow clicks on buttons
    return false;
  }
}

/**
 * State for tracking transclusion content
 */
interface TransclusionState {
  embeds: Map<
    string,
    {
      link: ParsedLink;
      content: string | null;
      loading: boolean;
      error: string | null;
    }
  >;
}

/**
 * StateField for managing transclusion data
 */
const transclusionState = StateField.define<TransclusionState>({
  create() {
    return { embeds: new Map() };
  },
  update(state, tr) {
    let newState = state;

    // Handle content update effects
    for (const effect of tr.effects) {
      if (effect.is(updateTransclusionContent)) {
        const newEmbeds = new Map(newState.embeds);
        const existing = newEmbeds.get(effect.value.embedId);
        if (existing) {
          newEmbeds.set(effect.value.embedId, {
            ...existing,
            content: effect.value.content,
            loading: false,
            error: null,
          });
        }
        newState = { embeds: newEmbeds };
      }

      if (effect.is(setTransclusionError)) {
        const newEmbeds = new Map(newState.embeds);
        const existing = newEmbeds.get(effect.value.embedId);
        if (existing) {
          newEmbeds.set(effect.value.embedId, {
            ...existing,
            content: null,
            loading: false,
            error: effect.value.error,
          });
        }
        newState = { embeds: newEmbeds };
      }
    }

    return newState;
  },
});

/**
 * Build decorations for all embeds in the document
 */
function buildDecorations(
  view: EditorView,
  state: TransclusionState,
  onEdit: (link: ParsedLink) => void,
  onJump: (link: ParsedLink) => void
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc.toString();

  // Parse embeds from document
  const embeds = parseLinks(doc).filter((link) => link.type === 'embed');

  for (const embed of embeds) {
    const embedId = embed.target + '#' + (embed.blockId ?? 'full');
    const embedState = state.embeds.get(embedId);

    // Create a replace decoration that swaps the ![[...]] with the widget
    decorations.push(
      Decoration.replace({
        widget: new TransclusionWidget(
          embed,
          embedState?.content ?? null,
          embedState?.loading ?? true,
          embedState?.error ?? null,
          () => onEdit(embed),
          () => onJump(embed)
        ),
      }).range(embed.position.start, embed.position.end)
    );
  }

  return Decoration.set(decorations, true);
}

/**
 * Configuration for the transclusion extension
 */
export interface TransclusionConfig {
  /**
   * Resolve embed content
   * @param target - Note name or path
   * @param blockId - Block ID or null for full note
   * @returns The content to display
   */
  resolveEmbed: (target: string, blockId: string | null) => Promise<string>;

  /**
   * Handle edit action - open the source for editing
   */
  onEdit: (target: string, blockId: string | null) => void;

  /**
   * Handle jump action - navigate to the source
   */
  onJump: (target: string, blockId: string | null) => void;
}

/**
 * Create the transclusion extension
 *
 * @param config - Configuration with resolve, edit, and jump callbacks
 * @returns CodeMirror extension array
 *
 * @example
 * ```typescript
 * const ext = transclusionExtension({
 *   resolveEmbed: async (target, blockId) => {
 *     // Load content from vault
 *     return await loadNoteContent(target, blockId);
 *   },
 *   onEdit: (target, blockId) => {
 *     // Open note for editing
 *     openNote(target, blockId);
 *   },
 *   onJump: (target, blockId) => {
 *     // Navigate to note
 *     navigateToNote(target, blockId);
 *   },
 * });
 * ```
 */
export function transclusionExtension(config: TransclusionConfig) {
  return [
    transclusionState,
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        private loadingEmbeds = new Set<string>();

        constructor(view: EditorView) {
          this.decorations = this.buildDecos(view);
          this.loadEmbeds(view);
        }

        update(update: ViewUpdate) {
          // Rebuild decorations if document or viewport changed
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecos(update.view);
            this.loadEmbeds(update.view);
          }

          // Also rebuild if state effects were applied
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (
                effect.is(updateTransclusionContent) ||
                effect.is(setTransclusionError)
              ) {
                this.decorations = this.buildDecos(update.view);
              }
            }
          }
        }

        buildDecos(view: EditorView): DecorationSet {
          const state = view.state.field(transclusionState);
          return buildDecorations(
            view,
            state,
            (link) => config.onEdit(link.target, link.blockId),
            (link) => config.onJump(link.target, link.blockId)
          );
        }

        async loadEmbeds(view: EditorView) {
          const doc = view.state.doc.toString();
          const embeds = parseLinks(doc).filter((l) => l.type === 'embed');
          const state = view.state.field(transclusionState);

          for (const embed of embeds) {
            const embedId = embed.target + '#' + (embed.blockId ?? 'full');

            // Skip if already loaded or currently loading
            if (state.embeds.has(embedId) || this.loadingEmbeds.has(embedId)) {
              continue;
            }

            // Mark as loading
            this.loadingEmbeds.add(embedId);
            state.embeds.set(embedId, {
              link: embed,
              content: null,
              loading: true,
              error: null,
            });

            // Load content asynchronously
            try {
              const content = await config.resolveEmbed(
                embed.target,
                embed.blockId
              );
              view.dispatch({
                effects: updateTransclusionContent.of({ embedId, content }),
              });
            } catch (err) {
              view.dispatch({
                effects: setTransclusionError.of({
                  embedId,
                  error: err instanceof Error ? err.message : 'Failed to load',
                }),
              });
            } finally {
              this.loadingEmbeds.delete(embedId);
            }
          }
        }
      },
      {
        decorations: (v) => v.decorations,
      }
    ),
  ];
}
