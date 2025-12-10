"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, FileText, Folder } from "lucide-react"

interface FileNavigatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const mockFiles = [
  { id: "1", name: "Getting Started", type: "file", icon: FileText },
  { id: "2", name: "Project Notes", type: "file", icon: FileText },
  { id: "3", name: "Meeting Notes", type: "file", icon: FileText },
  { id: "4", name: "Ideas", type: "folder", icon: Folder },
  { id: "5", name: "Research", type: "folder", icon: Folder },
]

export function FileNavigatorDialog({ open, onOpenChange }: FileNavigatorDialogProps) {
  const [search, setSearch] = useState("")

  const filtered = mockFiles.filter((file) => file.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Open File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:border-primary"
              autoFocus
            />
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No files found</div>
            ) : (
              filtered.map((file) => {
                const Icon = file.icon
                return (
                  <button
                    key={file.id}
                    className="w-full flex items-center gap-3 px-4 py-2 rounded hover:bg-muted transition-colors text-left"
                    onClick={() => onOpenChange(false)}
                  >
                    <Icon className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-foreground">{file.name}</div>
                      <div className="text-sm text-muted-foreground">{file.type === "file" ? "Note" : "Folder"}</div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
