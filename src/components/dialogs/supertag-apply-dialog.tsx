/**
 * SupertagApplyDialog Component
 *
 * Dialog for applying a supertag to a note and setting field values.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { SupertagFieldEditor } from '@/components/supertags/SupertagFieldEditor';

interface SupertagApplyDialogProps {
  open: boolean;
  onClose: () => void;
  noteId: string | null;
  preselectedDefinitionId?: string;
}

export function SupertagApplyDialog({
  open,
  onClose,
  noteId,
  preselectedDefinitionId,
}: SupertagApplyDialogProps) {
  const { definitions } = useSupertagDefinitions();
  const { apply, instances } = useNoteSuperTags(noteId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});

  // Filter already applied supertags
  const appliedIds = instances.map((i) => i.definitionId);
  const availableDefinitions = definitions.filter((d) => !appliedIds.includes(d.id));

  // Set preselected or first available
  useEffect(() => {
    if (preselectedDefinitionId && !appliedIds.includes(preselectedDefinitionId)) {
      setSelectedId(preselectedDefinitionId);
    } else if (availableDefinitions.length > 0 && !selectedId) {
      setSelectedId(availableDefinitions[0].id);
    }
  }, [definitions, preselectedDefinitionId, availableDefinitions, selectedId, appliedIds]);

  const selectedDefinition = definitions.find((d) => d.id === selectedId);

  // Reset values when definition changes
  useEffect(() => {
    if (selectedDefinition) {
      const defaultValues: Record<string, any> = {};
      selectedDefinition.fields.forEach((field) => {
        if (field.default !== undefined) {
          defaultValues[field.name] = field.default;
        }
      });
      setValues(defaultValues);
    }
  }, [selectedDefinition]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setValues({});
      setSelectedId(null);
    }
  }, [open]);

  const handleApply = () => {
    if (!selectedId || !noteId) return;
    apply(selectedId, values);
    setValues({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply Supertag</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {availableDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {definitions.length === 0
                ? 'No supertag templates exist. Create one first.'
                : 'All supertags have been applied to this note.'}
            </p>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium">Select Supertag</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded bg-background"
                  value={selectedId ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {availableDefinitions.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.icon ? `${def.icon} ` : ''}{def.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedDefinition && selectedDefinition.fields.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Field Values</label>
                  {selectedDefinition.fields.map((field) => (
                    <div key={field.name}>
                      <label className="text-xs text-muted-foreground block mb-1">
                        {field.name}
                      </label>
                      <SupertagFieldEditor
                        field={field}
                        value={values[field.name]}
                        onChange={(v) =>
                          setValues({ ...values, [field.name]: v })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedId || availableDefinitions.length === 0}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
