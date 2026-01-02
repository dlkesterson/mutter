/**
 * SupertagCreatorDialog Component
 *
 * Dialog for creating new supertag templates with typed fields.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import type { SupertagFieldType } from '@/types/supertag';

interface FieldInput {
  id: string;
  name: string;
  type: SupertagFieldType;
  options?: string[];
  default?: string | number | boolean;
}

const FIELD_TYPES: { value: SupertagFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multi-select', label: 'Multi-select' },
];

interface SupertagCreatorDialogProps {
  open: boolean;
  onClose: () => void;
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function SupertagCreatorDialog({ open, onClose }: SupertagCreatorDialogProps) {
  const { create } = useSupertagDefinitions();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [fields, setFields] = useState<FieldInput[]>([]);
  const [optionsInput, setOptionsInput] = useState<Record<string, string>>({});

  const addField = () => {
    setFields([
      ...fields,
      { id: generateId(), name: '', type: 'text', options: [] },
    ]);
  };

  const updateField = (id: string, updates: Partial<FieldInput>) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    const newOptionsInput = { ...optionsInput };
    delete newOptionsInput[id];
    setOptionsInput(newOptionsInput);
  };

  const handleSave = () => {
    if (!name.trim()) return;

    // Process fields, parsing options from comma-separated strings
    const processedFields = fields
      .filter((f) => f.name.trim())
      .map((field) => {
        const { id, ...fieldData } = field;
        
        // Parse options if this is a select field
        if (field.type === 'select' || field.type === 'multi-select') {
          const optionStr = optionsInput[id] || '';
          fieldData.options = optionStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }

        return {
          ...fieldData,
          name: fieldData.name.trim(),
        };
      });

    create({
      name: name.trim(),
      icon: icon || undefined,
      fields: processedFields,
    });

    // Reset form
    setName('');
    setIcon('');
    setFields([]);
    setOptionsInput({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Supertag Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="project, meeting, person..."
              />
            </div>
            <div>
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="📁"
                className="text-center"
              />
            </div>
          </div>

          <div>
            <Label>Fields</Label>
            <div className="space-y-3 mt-2">
              {fields.map((field) => (
                <div key={field.id} className="space-y-2 p-3 border border-border rounded-md">
                  <div className="flex gap-2 items-start">
                    <Input
                      value={field.name}
                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                      placeholder="Field name"
                      className="flex-1"
                    />
                    <select
                      value={field.type}
                      onChange={(e) =>
                        updateField(field.id, { type: e.target.value as SupertagFieldType })
                      }
                      className="px-2 py-2 border border-border rounded text-sm bg-background"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeField(field.id)}
                    >
                      ×
                    </Button>
                  </div>
                  
                  {(field.type === 'select' || field.type === 'multi-select') && (
                    <div>
                      <Label className="text-xs">Options (comma-separated)</Label>
                      <Input
                        value={optionsInput[field.id] || ''}
                        onChange={(e) =>
                          setOptionsInput({ ...optionsInput, [field.id]: e.target.value })
                        }
                        placeholder="option1, option2, option3"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addField} className="mt-2">
              + Add Field
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Create Supertag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
