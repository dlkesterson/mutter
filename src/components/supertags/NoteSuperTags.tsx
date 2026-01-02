/**
 * NoteSuperTags Component
 *
 * Displays supertags applied to a note with add functionality.
 * Typically shown in the note header.
 */

import { useState } from 'react';
import { useNoteSuperTags } from '@/hooks/useNoteSuperTags';
import { useSupertagDefinitions } from '@/hooks/useSupertagDefinitions';
import { SupertagBadge } from './SupertagBadge';
import { SupertagApplyDialog } from '@/components/dialogs/supertag-apply-dialog';

interface NoteSuperTagsProps {
  noteId: string | null;
}

export function NoteSuperTags({ noteId }: NoteSuperTagsProps) {
  const { instances, remove } = useNoteSuperTags(noteId);
  const { getById } = useSupertagDefinitions();
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);

  if (!noteId) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      {instances.map((instance) => {
        const definition = getById(instance.definitionId);
        if (!definition) return null;
        return (
          <SupertagBadge
            key={instance.definitionId}
            definition={definition}
            instance={instance}
            onRemove={() => remove(instance.definitionId)}
          />
        );
      })}
      <button
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setApplyDialogOpen(true)}
      >
        + Add tag
      </button>
      <SupertagApplyDialog
        open={applyDialogOpen}
        onClose={() => setApplyDialogOpen(false)}
        noteId={noteId}
      />
    </div>
  );
}
