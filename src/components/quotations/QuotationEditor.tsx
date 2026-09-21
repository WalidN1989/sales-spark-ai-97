import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, Copy, Save, Link2, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { searchProducts } from "@/lib/products.functions";
import {
  createQuotation,
  updateQuotation,
  searchQuoteTargets,
  type QuotationWithItems,
  type QuoteTarget,
} from "@/lib/quotations.functions";
import { getOrCreatePrimaryLeadForCompany } from "@/lib/leads.functions";

// Pre-link a brand-new quote to a lead (from the lead / prospect page).
export type QuotePrefill = { lead_id: string; company: string; contact: string | null };
import {
  CURRENCIES,
  DEFAULT_RATES,
  DEFAULT_DDP,
  computeQuoteTotals,
  computeCustomerLines,
  fmtMoney,
  type DdpConfig,
} from "@/lib/quote-math";

type Row = {
  key: string;
  product_id: string | null;
  part_number: string;
  description: string;
  qty: number;
  unit_aed: number; // base price in AED units (not cents) for easy editing
  brand: string | null;
  category: string | null;
};

const RATES_KEY = "qq_rates";
const DDP_KEY = "qq_ddp";

let rowSeq = 0;
const newKey = () => `r${rowSeq++}`;

function loadRates(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RATES_KEY);
    if (raw) return { ...DEFAULT_RATES, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_RATES };
}

function loadDdp(): DdpConfig {
  try {
    const raw = localStorage.getItem(DDP_KEY);
    if (raw) return { ...DEFAULT_DDP, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_DDP };
}

// Map a product's brand/category to the coarse business bucket the list filters by.
function categoryBucket(brand: string | null, category: string | null): string {
  const s = `${brand ?? ""} ${category ?? ""}`.toLowerCase();
  if (/turnstile|speed\s*gate|flap|tripod/.test(s)) return "Turnstile & Speed Gates";
  if (/wacom|cintiq|intuos|movink|bamboo|pen\s*display|pen\s*tablet/.test(s)) return "Wacom";
  if (/ubio|nitgen|fingerprint|face|iris|access\s*control|acs|attendance|virdi/.test(s))
    return "TNA & ACS";
  if (/ribbon|film|consumable|laminat|card|printer|reader|scanner/.test(s)) return "Consumables";
  return "Other";
}

export function QuotationEditor({
  initial,
  prefill,
}: {
  initial?: QuotationWithItems | null;
  prefill?: QuotePrefill | null;
}) {
  const navigate = useNavigate();
  const doSearch = useServerFn(searchProducts);
  const create = useServerFn(createQuotation);
  const update = useServerFn(updateQuotation);
  const findTargets = useServerFn(searchQuoteTargets);
  const resolveLead = useServerFn(getOrCreatePrimaryLeadForCompany);
  const qc = useQueryClient();
  // After a save, refresh the CRM views the quote just touched.
  const refreshCrm = () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead-quotations"] });
    if (leadId) qc.invalidateQueries({ queryKey: ["lead", leadId] });
  };

  const [company, setCompany] = useState(initial?.company_name ?? prefill?.company ?? "");
  const [contact, setContact] = useState(initial?.contact_name ?? prefill?.contact ?? "");

  // CRM link: the lead this quote belongs to. Saving/copying logs an entry in
  // that lead's Activity Journal and moves it to the Quotation stage.
  const [leadId, setLeadId] = useState<string | null>(initial?.lead_id ?? prefill?.lead_id ?? null);
  const [leadLabel, setLeadLabel] = useState<string | null>(
    initial?.lead_label ??
      (prefill ? [prefill.company, prefill.contact].filter(Boolean).join(" · ") : null),
  );
  const [coOpen, setCoOpen] = useState(false);
  const [targets, setTargets] = useState<QuoteTarget[]>([]);
  const [linking, setLinking] = useState(false);
  const coTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (coTimer.current) clearTimeout(coTimer.current);
    if (!coOpen || company.trim().length < 2) {
      setTargets([]);
      return;
    }
    coTimer.current = setTimeout(async () => {
      try {
        setTargets(await findTargets({ data: { q: company } }));
      } catch {
        setTargets([]);
      }
    }, 250);
  }, [company, coOpen, findTargets]);

  async function pickTarget(t: QuoteTarget) {
    setCoOpen(false);
    setTargets([]);
    setCompany(t.company);
    if (t.contact) setContact(t.contact);
    let id = t.lead_id;
    if (!id && t.company_id) {
      // A prospect with no lead yet: attach to its primary lead (created if
      // needed). Conversion into Leads happens on Save/Copy, not on pick, so
      // picking and cancelling converts nothing.
      setLinking(true);
      try {
        id = (await resolveLead({ data: { companyId: t.company_id, convert: false } })).leadId;
      } catch (e) {
        toast.error((e as Error).message);
        return;
      } finally {
        setLinking(false);
      }
    }
    setLeadId(id);
    setLeadLabel(t.contact ? `${t.company} · ${t.contact}` : t.company);
  }
  const [rows, setRows] = useState<Row[]>(
    (initial?.items ?? []).map((it) => ({
      key: newKey(),
      product_id: it.product_id,
      part_number: it.part_number ?? "",
      description: it.description ?? "",
      qty: Number(it.qty) || 1,
      unit_aed: (Number(it.unit_price_cents) || 0) / 100,
      brand: null,
      category: null,
    })),
  );
  const [currency, setCurrency] = useState(initial?.currency ?? "AED");
  const [rates, setRates] = useState<Record<string, number>>(() =>
    initial ? { ...loadRates(), [initial.currency]: initial.exchange_rate } : loadRates(),
  );
  const [vatRate, setVatRate] = useState<number>(initial?.vat_rate ?? 5);
  const [ddp, setDdp] = useState<DdpConfig>(initial ? { ...DEFAULT_DDP, ...initial.ddp } : loadDdp());
  const [showRates, setShowRates] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(initial?.id ?? null);
  const [quoteNumber, setQuoteNumber] = useState<number | null>(initial?.quote_number ?? null);
  const [saving, setSaving] = useState(false);

  // product search
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = (await doSearch({ data: { q } })) as Array<Record<string, unknown>>;
        setResults(r);
      } catch {
        setResults([]);
      }
    }, 250);
  }, [q, doSearch]);

  // persist rate/ddp defaults for next time (only in "new" mode)
  useEffect(() => {
    if (!initial) {
      try {
        localStorage.setItem(RATES_KEY, JSON.stringify(rates));
      } catch {
        /* ignore */
      }
    }
  }, [rates, initial]);
  useEffect(() => {
    if (!initial) {
      try {
        localStorage.setItem(DDP_KEY, JSON.stringify(ddp));
      } catch {
        /* ignore */
      }
    }
  }, [ddp, initial]);

  const rate = rates[currency] || 1;
  const transformed = currency !== "AED" || ddp.enabled;

  const itemsCents = useMemo(
    () => rows.map((r) => ({ qty: r.qty, unit_price_cents: Math.round((r.unit_aed || 0) * 100) })),
    [rows],
  );
  const totals = useMemo(
    () => computeQuoteTotals(itemsCents, currency, rate, vatRate, ddp),
    [itemsCents, currency, rate, vatRate, ddp],
  );
  const custLines = useMemo(
    () => computeCustomerLines(itemsCents, rate, ddp),
    [itemsCents, rate, ddp],
  );
  const worksheetItemsAed = rows.reduce((s, r) => s + (r.qty || 0) * (r.unit_aed || 0), 0);

  function addProduct(p: Record<string, unknown>) {
    setRows((prev) => [
      ...prev,
      {
        key: newKey(),
        product_id: (p.id as string) ?? null,
        part_number: (p.part_number as string) ?? "",
        description: (p.name as string) ?? "",
        qty: 1,
        unit_aed: ((p.selling_price_cents as number) ?? 0) / 100,
        brand: (p.brand as string) ?? null,
        category: (p.category as string) ?? null,
      },
    ]);
    setQ("");
    setResults([]);
  }

  function addBlankRow() {
    setRows((prev) => [
      ...prev,
      { key: newKey(), product_id: null, part_number: "", description: "", qty: 1, unit_aed: 0, brand: null, category: null },
    ]);
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function derivedCategory(): string {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const b = categoryBucket(r.brand, r.category);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    let best = "Other";
    let bestN = -1;
    for (const [k, n] of Object.entries(counts)) if (n > bestN) ((best = k), (bestN = n));
    return best;
  }

  async function persist(
    event: "saved" | "copied",
  ): Promise<{ id: string; number: number; logged: boolean } | null> {
    if (rows.length === 0) {
      toast.error("Add at least one line item first.");
      return null;
    }
    const payload = {
      lead_id: leadId,
      company_name: company || null,
      contact_name: contact || null,
      currency,
      exchange_rate: rate,
      vat_rate: vatRate,
      ddp,
      category: derivedCategory(),
      status: (initial?.status ?? "draft") as "draft" | "sent" | "accepted" | "rejected",
      items: rows.map((r) => ({
        product_id: r.product_id,
        part_number: r.part_number || null,
        description: r.description || null,
        qty: r.qty || 0,
        unit_price_cents: Math.round((r.unit_aed || 0) * 100),
      })),
    };
    if (editingId) {
      const u = (await update({ data: { id: editingId, patch: payload, log_event: event } })) as {
        logged?: boolean;
      };
      refreshCrm();
      return { id: editingId, number: quoteNumber ?? 0, logged: !!u?.logged };
    }
    const res = (await create({ data: { ...payload, log_event: event } })) as {
      id: string;
      quote_number: number;
      logged?: boolean;
    };
    setEditingId(res.id);
    setQuoteNumber(res.quote_number);
    refreshCrm();
    return { id: res.id, number: res.quote_number, logged: !!res.logged };
  }

  async function onSave() {
    setSaving(true);
    try {
      const r = await persist("saved");
      if (r) toast.success(`Quotation #${r.number} saved${r.logged ? " · logged on the lead" : ""}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function buildCopy(): { html: string; text: string } {
    const cur = currency;
    const th = (t: string, align?: string) =>
      `<th style="border:1px solid #000;padding:6px 10px;background-color:#f2f2f2;font-weight:bold;text-align:${align || "left"};">${escapeHtml(t)}</th>`;
    const td = (t: string, align?: string) =>
      `<td style="border:1px solid #000;padding:6px 10px;white-space:pre-wrap;text-align:${align || "left"};">${escapeHtml(t).replace(/\n/g, "<br>")}</td>`;
    let body = "";
    rows.forEach((r, i) => {
      const cl = custLines[i];
      body +=
        `<tr>${td(String(i + 1), "center")}${td(r.part_number)}${td(r.description)}` +
        `${td(String(r.qty), "right")}${td(fmtMoney(cl.unit_final_cents), "right")}${td(fmtMoney(cl.line_total_cents), "right")}</tr>`;
    });
    const sum = (label: string, cents: number) =>
      `<tr><td colspan="5" style="border:1px solid #000;padding:6px 10px;font-weight:bold;text-align:right;">${escapeHtml(label)}</td><td style="border:1px solid #000;padding:6px 10px;font-weight:bold;text-align:right;">${fmtMoney(cents)}</td></tr>`;
    const html =
      `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">` +
      `<tr>${th("#", "center")}${th("Part No")}${th("Description")}${th("Qty", "right")}${th(`Unit Price (${cur})`, "right")}${th(`Total Price (${cur})`, "right")}</tr>` +
      body +
      sum("Items Total", totals.items_total_cents) +
      sum(`VAT (${vatRate}%)`, totals.vat_cents) +
      sum(`GRAND TOTAL ${cur}`, totals.grand_total_cents) +
      `</table>`;

    const flat = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
    const lines = [`#\tPart No\tDescription\tQty\tUnit Price (${cur})\tTotal Price (${cur})`];
    rows.forEach((r, i) => {
      const cl = custLines[i];
      lines.push(`${i + 1}\t${r.part_number}\t${flat(r.description)}\t${r.qty}\t${fmtMoney(cl.unit_final_cents)}\t${fmtMoney(cl.line_total_cents)}`);
    });
    lines.push(`\t\t\t\tItems Total\t${fmtMoney(totals.items_total_cents)}`);
    lines.push(`\t\t\t\tVAT (${vatRate}%)\t${fmtMoney(totals.vat_cents)}`);
    lines.push(`\t\t\t\tGRAND TOTAL ${cur}\t${fmtMoney(totals.grand_total_cents)}`);
    return { html, text: lines.join("\n") };
  }

  async function onCopy() {
    if (rows.length === 0) {
      toast.error("Add at least one line item first.");
      return;
    }
    const { html, text } = buildCopy();
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } catch (e) {
      toast.error("Copy failed: " + (e as Error).message);
      return;
    }
    // Every copied quote is also saved, so the history is complete.
    try {
      const r = await persist("copied");
      toast.success(
        r ? `Copied — saved as Quotation #${r.number}${r.logged ? " · logged on the lead" : ""}` : "Copied",
      );
    } catch {
      toast.success("Copied (save failed — try Save)");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {editingId ? `Quotation #${quoteNumber ?? ""}` : "New quotation"}
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/app/quotations" })}>
            Back
          </Button>
          <Button variant="outline" onClick={onSave} disabled={saving}>
            <Save className="mr-1 h-4 w-4" /> Save
          </Button>
          <Button onClick={onCopy} disabled={saving}>
            <Copy className="mr-1 h-4 w-4" /> Copy for email / WhatsApp
          </Button>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
            <Input
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setCoOpen(true);
              }}
              onFocus={() => setCoOpen(true)}
              onBlur={() => setCoOpen(false)}
              placeholder="Company name — pick from Leads / Prospects to link"
            />
            {coOpen && targets.length > 0 && (
              <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                {targets.map((t) => (
                  <button
                    key={`${t.kind}:${t.lead_id ?? t.company_id}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus so blur doesn't close before click
                      void pickTarget(t);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.company}</span>
                      {t.contact && <span className="block truncate text-xs text-muted-foreground">{t.contact}</span>}
                    </span>
                    <span
                      className={
                        t.kind === "lead" && t.converted
                          ? "shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                      }
                    >
                      {t.kind === "lead" && t.converted ? "Lead" : "Prospect"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact</label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact person" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {leadId ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Link2 className="h-3 w-3" /> Linked to {leadLabel ?? "CRM lead"}
              </span>
              <button
                type="button"
                onClick={() => navigate({ to: "/app/leads/$id", params: { id: leadId } })}
                className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" /> Open lead
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeadId(null);
                  setLeadLabel(null);
                }}
                className="inline-flex items-center gap-0.5 text-muted-foreground hover:text-rose-600"
              >
                <X className="h-3 w-3" /> Unlink
              </button>
            </>
          ) : (
            <span className="text-muted-foreground">
              {linking
                ? "Linking…"
                : "Not linked — type the company and pick it from the list so Save / Copy logs this quote on the lead."}
            </span>
          )}
        </div>
      </Card>

      {/* Add product */}
      <Card className="space-y-2 p-4">
        <label className="block text-sm font-semibold">Add products</label>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your price list by name, part # or brand…"
            className="pl-9"
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
              {results.map((p) => (
                <button
                  key={p.id as string}
                  onClick={() => addProduct(p)}
                  className="flex w-full items-start justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{(p.part_number as string) || "—"}</span>{" "}
                    <span className="text-muted-foreground">{p.name as string}</span>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {p.selling_price_cents != null
                      ? `${fmtMoney(p.selling_price_cents as number)} AED`
                      : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Currency + VAT + DDP controls */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => setShowRates((v) => !v)}>
              Rates
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">VAT %</label>
            <Input
              type="number"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value) || 0)}
              className="w-20"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ddp.enabled}
              onChange={(e) => setDdp({ ...ddp, enabled: e.target.checked })}
            />
            Apply DDP (duty paid)
          </label>
        </div>

        {showRates && (
          <div className="flex flex-wrap gap-3 rounded-md bg-muted/40 p-3 text-xs">
            <span className="self-center text-muted-foreground">1 AED =</span>
            {CURRENCIES.filter((c) => c !== "AED").map((c) => (
              <label key={c} className="flex items-center gap-1">
                {c}
                <Input
                  type="number"
                  step="0.0001"
                  value={rates[c] ?? ""}
                  onChange={(e) => setRates({ ...rates, [c]: Number(e.target.value) || 0 })}
                  className="w-24"
                />
              </label>
            ))}
          </div>
        )}

        {ddp.enabled && (
          <div className="flex flex-wrap gap-3 rounded-md bg-muted/40 p-3 text-xs">
            {(
              [
                ["BOQ fixed", "boq_fixed"],
                ["Per KG", "per_kg"],
                ["Total weight (kg)", "weight"],
                ["Per unit", "per_unit"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-muted-foreground">{label} (AED)</span>
                <Input
                  type="number"
                  value={ddp[key]}
                  onChange={(e) => setDdp({ ...ddp, [key]: Number(e.target.value) || 0 })}
                  className="w-28"
                />
              </label>
            ))}
          </div>
        )}
      </Card>

      {/* Line items (AED worksheet) */}
      <Card className="p-4">
        {transformed && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Working prices (AED base) — edit here
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">#</th>
                <th className="p-2">Part No</th>
                <th className="p-2">Description</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Unit Price (AED)</th>
                <th className="p-2 text-right">Total (AED)</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-b align-top">
                  <td className="p-2 text-center">{i + 1}</td>
                  <td className="p-2">
                    <Input
                      value={r.part_number}
                      onChange={(e) => patchRow(r.key, { part_number: e.target.value })}
                      className="w-28"
                    />
                  </td>
                  <td className="p-2">
                    <textarea
                      value={r.description}
                      onChange={(e) => patchRow(r.key, { description: e.target.value })}
                      rows={2}
                      className="w-full resize-y rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      value={r.qty}
                      onChange={(e) => patchRow(r.key, { qty: Number(e.target.value) || 0 })}
                      className="w-16 text-right"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      value={r.unit_aed}
                      onChange={(e) => patchRow(r.key, { unit_aed: Number(e.target.value) || 0 })}
                      className="w-28 text-right"
                    />
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtMoney(Math.round((r.qty || 0) * (r.unit_aed || 0) * 100))}
                  </td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => removeRow(r.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    Search a product above, or add a blank line.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={5} className="p-2 text-right">
                  Items Total (AED)
                </td>
                <td className="p-2 text-right tabular-nums">
                  {fmtMoney(Math.round(worksheetItemsAed * 100))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Button variant="outline" size="sm" className="mt-2" onClick={addBlankRow}>
          <Plus className="mr-1 h-4 w-4" /> Add blank row
        </Button>
      </Card>

      {/* Customer preview */}
      {transformed && rows.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-primary">
            What the customer sees — {currency}
            {ddp.enabled ? " · DDP included in unit price" : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm [&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2">#</th>
                  <th className="p-2 text-left">Part No</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit Price</th>
                  <th className="p-2 text-right">Total Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td className="p-2 text-center">{i + 1}</td>
                    <td className="p-2">{r.part_number}</td>
                    <td className="whitespace-pre-wrap p-2">{r.description}</td>
                    <td className="p-2 text-right">{r.qty}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(custLines[i]?.unit_final_cents ?? 0)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoney(custLines[i]?.line_total_cents ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr>
                  <td colSpan={5} className="p-2 text-right">
                    Items Total
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(totals.items_total_cents)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="p-2 text-right">
                    VAT ({vatRate}%)
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(totals.vat_cents)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="p-2 text-right">
                    GRAND TOTAL {currency}
                  </td>
                  <td className="p-2 text-right tabular-nums">{fmtMoney(totals.grand_total_cents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
