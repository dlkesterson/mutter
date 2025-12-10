"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface VoiceLogEntry {
  transcription: string
  command: string
  confidence: number
}

interface VoiceLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: VoiceLogEntry[]
}

export function VoiceLogDialog({ open, onOpenChange, entries }: VoiceLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Voice Command History</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No voice commands yet. Use the voice indicator to start.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={idx} className="p-3 bg-muted rounded-lg border border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground break-words">{entry.transcription}</div>
                      <div className="text-sm text-muted-foreground mt-1">Interpreted: {entry.command}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Confidence: {Math.round(entry.confidence * 100)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
