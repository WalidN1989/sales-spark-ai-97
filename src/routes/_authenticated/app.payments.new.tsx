import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createPaymentFollowup } from "@/lib/payments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_OPTIONS, CATEGORY_META } from "@/lib/payments-ui";

export const Route = createFileRoute("/_authenticated/app/payments/new")({
  head: () => ({ meta: [{ title: "New follow-up — Sales Insights" }] }),
  component: NewFollowup,
});

function NewFollowup() {
  const navigate = useNavigate();
  const createFn = useServerFn(createPaymentFollowup);

  const [company, setCompany] = useState("");
  const [category, setCategory] = useState<string>("pending_pdc");
  const [reference, setReference] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitSku, setUnitSku] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!company.trim()) return toast.error("Company name is required");
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          company_name: company.trim(),
          category: category as (typeof CATEGORY_OPTIONS)[number],
          reference: reference.trim() || null,
          title: title.trim(),
          amount_aed: amount ? Number(amount) : null,
          quantity: quantity ? Number(quantity) : null,
          unit_sku: unitSku.trim() || null,
          due_date: dueDate || null,
          sent_date: sentDate || null,
          priority: priority as "low" | "normal" | "high",
          status: "open",
          owner: "Walid",
          notes: notes.trim() || null,
        },
      });
      toast.success("Follow-up created");
      navigate({ to: "/app/payments/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/payments">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <Card>
        <CardHeader><CardTitle>New payment follow-up</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Company name *</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Techsys Technology LLC" />
          </div>
          <div>
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_META[c].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reference (Inv / PI / PO)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="26391" />
          </div>
          <div className="sm:col-span-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inv. 26391 PDC" />
          </div>
          <div>
            <Label>Amount (AED)</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Unit / SKU</Label>
            <Input value={unitSku} onChange={(e) => setUnitSku(e.target.value)} placeholder="STU-540" />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Sent date (PI / demo)</Label>
            <Input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/app/payments" })}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
