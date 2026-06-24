import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPurchasesBySourceCompany } from "@/lib/lead-purchases.functions";
import { addToQualifying } from "@/lib/qualifying.functions";

export function AddToQualifyingDialog({
  sourceCompanyId,
  competitorSlug,
  competitorName,
}: {
  sourceCompanyId: string;
  competitorSlug: string;
  competitorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [purchaseId, setPurchaseId] = useState<string>("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn(listPurchasesBySourceCompany);
  const addFn = useServerFn(addToQualifying);

  const { data: purchases } = useQuery({
    queryKey: ["purchases-by-source", sourceCompanyId],
    queryFn: () => listFn({ data: { companyId: sourceCompanyId } }),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          sourceCompanyId,
          competitorSlug,
          sourceLeadPurchaseId: purchaseId || null,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["qualifying"] });
      toast.success(r.created ? "Added to Qualifying" : "Already in Qualifying");
      setOpen(false);
      navigate({ to: "/app/qualifying" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Target className="mr-1 h-4 w-4" /> Add to Qualifying
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {competitorName} to Qualifying</DialogTitle>
          <DialogDescription>
            Pick the product this competitor&apos;s peer already bought from you — it
            seeds the AI pitch email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Bought product (optional)</Label>
            {!purchases || purchases.length === 0 ? (
              <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                No purchases recorded on the source prospect yet. You can add this
                target now and attach a product later (mark the source lead as WON
                to capture it).
              </p>
            ) : (
              <Select value={purchaseId} onValueChange={setPurchaseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a bought product" />
                </SelectTrigger>
                <SelectContent>
                  {purchases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.brand, p.model_no, p.model_name].filter(Boolean).join(" · ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Add to Qualifying
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
