import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listLeadPurchases,
  upsertLeadPurchase,
  deleteLeadPurchase,
} from "@/lib/lead-purchases.functions";

type Row = {
  id?: string;
  brand: string;
  model_no: string;
  model_name: string;
  description: string;
  url: string;
  price: string;
};

const blank: Row = {
  brand: "",
  model_no: "",
  model_name: "",
  description: "",
  url: "",
  price: "",
};

/**
 * Mandatory popup when a lead is flipped to WON or HOT.
 * Requires at least one purchase row with model_name + (brand or model_no).
 */
export function LeadPurchaseDialog({
  open,
  onOpenChange,
  leadId,
  trigger,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  trigger: "won" | "hot" | "manual";
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadPurchases);
  const saveFn = useServerFn(upsertLeadPurchase);
  const deleteFn = useServerFn(deleteLeadPurchase);

  const { data: existing } = useQuery({
    queryKey: ["lead-purchases", leadId],
    queryFn: () => listFn({ data: { leadId } }),
    enabled: open,
  });

  const [rows, setRows] = useState<Row[]>([{ ...blank }]);

  useEffect(() => {
    if (!open) return;
    if (existing && existing.length) {
      setRows(
        existing.map((r) => ({
          id: r.id,
          brand: r.brand ?? "",
          model_no: r.model_no ?? "",
          model_name: r.model_name ?? "",
          description: r.description ?? "",
          url: r.url ?? "",
          price:
            r.price_cents != null ? String(Math.round(r.price_cents / 100)) : "",
        })),
      );
    } else {
      setRows([{ ...blank }]);
    }
  }, [existing, open]);

  const save = useMutation({
    mutationFn: async () => {
      const valid = rows.filter(
        (r) => r.model_name.trim() && (r.brand.trim() || r.model_no.trim()),
      );
      if (!valid.length) {
        throw new Error(
          "Add at least one product: model name + brand (or model number).",
        );
      }
      for (const r of valid) {
        await saveFn({
          data: {
            id: r.id,
            lead_id: leadId,
            brand: r.brand || null,
            model_no: r.model_no || null,
            model_name: r.model_name,
            description: r.description || null,
            url: r.url || null,
            price_cents: r.price ? Math.round(Number(r.price) * 100) : null,
            currency: "AED",
          },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-purchases", leadId] });
      qc.invalidateQueries({ queryKey: ["purchases-by-source"] });
      toast.success("Purchase saved");
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-purchases", leadId] }),
  });

  const addRow = () => setRows((p) => [...p, { ...blank }]);
  const removeRow = async (i: number) => {
    const r = rows[i];
    if (r.id) await remove.mutateAsync(r.id);
    setRows((p) => p.filter((_, idx) => idx !== i));
  };
  const update = (i: number, patch: Partial<Row>) =>
    setRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Mandatory if triggered by status transition — block close until saved
  const mandatory = trigger === "won" || trigger === "hot";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (mandatory && !v && !(existing?.length)) {
          toast.warning("Add what was bought before continuing.");
          return;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mandatory ? `Mark ${trigger.toUpperCase()} — what was bought?` : "Purchase details"}
          </DialogTitle>
          <DialogDescription>
            We use this to draft pitch emails to this customer&apos;s competitors. Multiple rows allowed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-md border p-3 space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Brand *</Label>
                  <Input
                    placeholder="WACOM"
                    value={r.brand}
                    onChange={(e) => update(i, { brand: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Model no. *</Label>
                  <Input
                    placeholder="STU-430"
                    value={r.model_no}
                    onChange={(e) => update(i, { model_no: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Model name *</Label>
                  <Input
                    placeholder="Signature Pad"
                    value={r.model_name}
                    onChange={(e) => update(i, { model_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Approx. price (AED)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="850"
                    value={r.price}
                    onChange={(e) => update(i, { price: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">URL (optional)</Label>
                  <Input
                    placeholder="https://…"
                    value={r.url}
                    onChange={(e) => update(i, { url: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs">Description (1 line)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Used for paperless patient consent signatures…"
                    value={r.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                </div>
              </div>
              {rows.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add another product
          </Button>
        </div>

        <DialogFooter>
          {!mandatory && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save & continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
