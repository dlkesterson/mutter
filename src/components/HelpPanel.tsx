/**
 * HelpPanel - In-App Help Reference
 *
 * Provides quick reference for:
 * - Voice commands
 * - Query DSL syntax
 * - Keyboard shortcuts
 *
 * Rendered as a collapsible panel in the sidebar or as a dialog.
 */

import { useState } from 'react';

type HelpSection = 'voice' | 'query' | 'shortcuts';

export function HelpPanel() {
  const [section, setSection] = useState<HelpSection>('voice');

  return (
    <div className="help-panel p-4 space-y-4">
      <h3 className="text-sm font-medium text-foreground">Help</h3>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(['voice', 'query', 'shortcuts'] as const).map((s) => (
          <button
            key={s}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              section === s
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSection(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="text-sm space-y-3">
        {section === 'voice' && <VoiceHelp />}
        {section === 'query' && <QueryHelp />}
        {section === 'shortcuts' && <ShortcutsHelp />}
      </div>
    </div>
  );
}

/**
 * Voice Commands Help Section
 */
function VoiceHelp() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">
        Speak commands while text is selected:
      </p>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Formatting</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">"make bold"</code> — Bold text
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"italicize"</code> — Italic text
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"heading 1"</code> — H1 heading
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"code block"</code> — Code fence
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Navigation</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">"show backlinks"</code> — Open panel
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"open file X"</code> — Open note
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"new note"</code> — Create note
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">AI</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">"summarize notes about X"</code> — AI query
          </li>
          <li>
            <code className="bg-muted px-1 rounded">"explain this"</code> — AI explanation
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Query DSL Help Section
 */
function QueryHelp() {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Query syntax for searching notes:</p>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Filters</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">tag:work</code> — Notes with #tag
          </li>
          <li>
            <code className="bg-muted px-1 rounded">linked:[[Note]]</code> — Notes linking to
          </li>
          <li>
            <code className="bg-muted px-1 rounded">from:[[Index]]</code> — Notes linked from
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Date Filters</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">created:&gt;2024-01-01</code> — After date
          </li>
          <li>
            <code className="bg-muted px-1 rounded">updated:&lt;=2024-06-01</code> — Before/on date
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Properties</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">has:links</code> — Has outgoing links
          </li>
          <li>
            <code className="bg-muted px-1 rounded">has:blocks</code> — Has block refs
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Field Queries</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <code className="bg-muted px-1 rounded">status:active</code> — Field value
          </li>
          <li>
            <code className="bg-muted px-1 rounded">priority:&gt;5</code> — Numeric comparison
          </li>
          <li>
            <code className="bg-muted px-1 rounded">project.status:done</code> — Type-specific
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Keyboard Shortcuts Help Section
 */
function ShortcutsHelp() {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">General</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+K
            </kbd>{' '}
            — Command palette
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+O
            </kbd>{' '}
            — Open file
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+N
            </kbd>{' '}
            — New note
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+S
            </kbd>{' '}
            — Save note
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+W
            </kbd>{' '}
            — Close tab
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Formatting</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+B
            </kbd>{' '}
            — Bold
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+I
            </kbd>{' '}
            — Italic
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+E
            </kbd>{' '}
            — Inline code
          </li>
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+⇧+S
            </kbd>{' '}
            — Strikethrough
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-foreground">Voice</h4>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono">
              {mod}+⇧+K
            </kbd>{' '}
            — Toggle voice input
          </li>
        </ul>
      </div>
    </div>
  );
}

