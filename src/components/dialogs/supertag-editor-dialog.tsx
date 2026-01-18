/**
 * SupertagEditorDialog Component
 *
 * Dialog for editing existing supertag templates.
 * Similar to SupertagCreatorDialog but pre-fills with existing data.
 */

import { useState, useEffect } from 'react';
import { BaseDialog, DialogActions, SelectField } from '@/components/ui/base-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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

interface SupertagEditorDialogProps {
  open: boolean;
  onClose: () => void;
  definitionId: string | null;
}

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function SupertagEditorDialog({ open, onClose, definitionId }: SupertagEditorDialogProps) {
  const { getById, update } = useSupertagDefinitions();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [fields, setFields] = useState<FieldInput[]>([]);
  const [optionsInput, setOptionsInput] = useState<Record<string, string>>({});

  // Load existing definition data when dialog opens
  useEffect(() => {
    if (open && definitionId) {
      const definition = getById(definitionId);
      if (definition) {
        setName(definition.name);
        setIcon(definition.icon || '');

        // Convert fields to input format
        const fieldInputs: FieldInput[] = definition.fields.map((f) => ({
          id: generateId(),
          name: f.name,
          type: f.type,
          options: f.options,
          default: f.default,
        }));
        setFields(fieldInputs);

        // Set up options input for select fields
        const newOptionsInput: Record<string, string> = {};
        fieldInputs.forEach((field) => {
          if ((field.type === 'select' || field.type === 'multi-select') && field.options) {
            newOptionsInput[field.id] = field.options.join(', ');
          }
        });
        setOptionsInput(newOptionsInput);
      }
    }
  }, [open, definitionId, getById]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName('');
      setIcon('');
      setFields([]);
      setOptionsInput({});
    }
  }, [open]);

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
    if (!name.trim() || !definitionId) return;

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

    update(definitionId, {
      name: name.trim(),
      icon: icon || undefined,
      fields: processedFields,
    });

    onClose();
  };

  if (!definitionId) return null;

  return (
    <BaseDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Edit Supertag Template"
      size="md"
      footer={
        <DialogActions
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Save Changes"
          confirmDisabled={!name.trim()}
        />
      }
    >
      <div className="space-y-4">
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
                  <SelectField
                    value={field.type}
                    onChange={(v) => updateField(field.id, { type: v as SupertagFieldType })}
                    options={FIELD_TYPES}
                    className="w-auto"
                  />
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
    </BaseDialog>
  );
}
