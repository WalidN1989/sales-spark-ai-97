import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ProductFormValues = {
  brand: string | null;
  name: string;
  part_number: string | null;
  category: string | null;
  cost_price_cents: number | null;
  selling_price_cents: number | null;
  margin_l1_pct: number | null;
  margin_l2_pct: number | null;
  currency: string;
  warranty: string | null;
  stock_status: string | null;
  notes: string | null;
};

type Initial = Partial<ProductFormValues> & { name?: string | null };

function toNumOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function centsToStr(c: number | null | undefined): string {
  if (c == null) return "";
  return (c / 100).toString();
}

export function ProductForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Initial;
  onSubmit: (v: ProductFormValues) => void;
  submitting?: boolean;
}) {
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [partNumber, setPartNumber] = useState(initial?.part_number ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [cost, setCost] = useState(centsToStr(initial?.cost_price_cents));
  const [selling, setSelling] = useState(centsToStr(initial?.selling_price_cents));
  const [m1, setM1] = useState(initial?.margin_l1_pct?.toString() ?? "");
  const [m2, setM2] = useState(initial?.margin_l2_pct?.toString() ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "AED");
  const [warranty, setWarranty] = useState(initial?.warranty ?? "");
  const [stock, setStock] = useState(initial?.stock_status ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      brand: brand.trim() || null,
      name: name.trim(),
      part_number: partNumber.trim().toUpperCase() || null,
      category: category.trim() || null,
      cost_price_cents: cost.trim() ? Math.round(Number(cost) * 100) : null,
      selling_price_cents: selling.trim() ? Math.round(Number(selling) * 100) : null,
      margin_l1_pct: toNumOrNull(m1),
      margin_l2_pct: toNumOrNull(m2),
      currency: currency.trim() || "AED",
      warranty: warranty.trim() || null,
      stock_status: stock.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <div>
            <Label>Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Part number</Label>
            <Input
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label>Cost price</Label>
            <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <Label>Selling price</Label>
            <Input
              type="number"
              step="0.01"
              value={selling}
              onChange={(e) => setSelling(e.target.value)}
            />
          </div>
          <div>
            <Label>Margin L1 (%)</Label>
            <Input type="number" step="0.1" value={m1} onChange={(e) => setM1(e.target.value)} />
          </div>
          <div>
            <Label>Margin L2 (%)</Label>
            <Input type="number" step="0.1" value={m2} onChange={(e) => setM2(e.target.value)} />
          </div>
          <div>
            <Label>Currency</Label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
          <div>
            <Label>Warranty</Label>
            <Input value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          </div>
          <div>
            <Label>Stock status</Label>
            <Input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="In stock / On order / —" />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={submitting || !name.trim()}>
              Save product
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
