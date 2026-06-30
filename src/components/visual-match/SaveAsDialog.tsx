import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export function SaveAsDialog({
  open,
  onOpenChange,
  kind,
  defaultName,
  defaultNotes,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "prospect" | "lead";
  defaultName: string;
  defaultNotes: string;
  busy: boolean;
  onSubmit: (name: string, notes: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState(defaultNotes);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setNotes(defaultNotes);
    }
  }, [open, defaultName, defaultNotes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Save as {kind === "prospect" ? "Prospect" : "Lead"}
          </DialogTitle>
          <DialogDescription>
            Confirm the {kind === "prospect" ? "company" : "contact"} name pulled from this match.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {kind === "prospect" ? "Company name" : "Contact person"}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(name.trim(), notes.trim())} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
