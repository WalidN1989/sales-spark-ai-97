import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

export type Attachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  url: string | null;
};

export function NoteAttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const isImage = attachment?.mime_type?.startsWith("image/");
  return (
    <Dialog open={!!attachment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl overflow-hidden p-0">
        <DialogTitle className="sr-only">{attachment?.file_name ?? "Attachment"}</DialogTitle>
        {attachment && (
          <>
            <div className="flex items-center justify-center bg-muted/30 p-6 min-h-[300px]">
              {isImage && attachment.url ? (
                <img
                  src={attachment.url}
                  alt={attachment.file_name}
                  className="max-h-[70vh] w-auto rounded-lg object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <FileText className="h-16 w-16" />
                  <span className="text-sm">{attachment.file_name}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3">
              <div className="text-sm">
                <div className="font-medium">{attachment.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {attachment.mime_type ?? "file"}
                  {attachment.size_bytes
                    ? ` • ${(attachment.size_bytes / 1024).toFixed(1)} KB`
                    : ""}
                </div>
              </div>
              {attachment.url && (
                <Button asChild size="sm" variant="outline">
                  <a href={attachment.url} target="_blank" rel="noreferrer" download>
                    <Download className="h-4 w-4" /> Download
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
