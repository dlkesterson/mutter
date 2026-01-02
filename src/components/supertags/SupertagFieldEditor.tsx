/**
 * SupertagFieldEditor Component
 *
 * Renders the appropriate input control for a supertag field type.
 */

import type { SupertagField } from '@/types/supertag';

interface SupertagFieldEditorProps {
  field: SupertagField;
  value: any;
  onChange: (value: any) => void;
}

export function SupertagFieldEditor({ field, value, onChange }: SupertagFieldEditorProps) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.name}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
          value={value ?? field.default ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-border"
          checked={value ?? field.default ?? false}
          onChange={(e) => onChange(e.target.checked)}
        />
      );

    case 'select':
      return (
        <select
          className="w-full px-2 py-1 border border-border rounded text-sm bg-background"
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'multi-select': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1">
          {field.options?.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-border"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange([...selected, opt]);
                  } else {
                    onChange(selected.filter((v: string) => v !== opt));
                  }
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      );
    }

    default:
      return <span className="text-muted-foreground text-sm">Unsupported field type</span>;
  }
}
