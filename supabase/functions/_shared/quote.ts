// Quotation math for agent routes — a Deno copy of src/lib/quote-math.ts.
// KEEP IN SYNC with that file: the app editor and agent-created quotes must
// produce identical totals. Base prices are AED cents; DDP is spread per unit
// and baked in, then converted to the quote currency (1 AED = rate × currency).

export type DdpConfig = {
  enabled: boolean;
  boq_fixed: number; // AED, flat per shipment
  per_kg: number; // AED per kg
  per_unit: number; // AED per unit
  weight: number; // total shipment weight, kg
};

export const DEFAULT_DDP: DdpConfig = { enabled: false, boq_fixed: 0, per_kg: 0, per_unit: 0, weight: 0 };

export const CURRENCIES = ["AED", "USD", "OMR", "QAR"] as const;

export const DEFAULT_RATES: Record<string, number> = {
  AED: 1,
  USD: 0.2723,
  OMR: 0.1047,
  QAR: 0.9911,
};

export function ddpPerUnitAedCents(items: { qty: number }[], ddp: DdpConfig): number {
  if (!ddp.enabled) return 0;
  const totalUnits = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  if (totalUnits <= 0) return 0;
  const totalAed =
    (Number(ddp.boq_fixed) || 0) +
    (Number(ddp.per_kg) || 0) * (Number(ddp.weight) || 0) +
    (Number(ddp.per_unit) || 0) * totalUnits;
  return Math.round((totalAed / totalUnits) * 100);
}

export function computeQuoteTotals(
  items: { qty: number; unit_price_cents: number }[],
  exchangeRate: number,
  vatRate: number,
  ddp: DdpConfig,
) {
  const rate = Number(exchangeRate) || 1;
  const ddpUnit = ddpPerUnitAedCents(items, ddp);
  let itemsTotal = 0;
  const lines = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const unit = Math.round(((Number(it.unit_price_cents) || 0) + ddpUnit) * rate);
    itemsTotal += unit * qty;
    return { unit_final_cents: unit, line_total_cents: unit * qty };
  });
  const vat = Math.round(itemsTotal * ((Number(vatRate) || 0) / 100));
  return { lines, items_total_cents: itemsTotal, vat_cents: vat, grand_total_cents: itemsTotal + vat };
}

export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return "0.00";
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same buckets as the editor's categoryBucket() — drives the list filter chips.
export function categoryBucket(brand: string | null, category: string | null): string {
  const s = `${brand ?? ""} ${category ?? ""}`.toLowerCase();
  if (/turnstile|speed\s*gate|flap|tripod/.test(s)) return "Turnstile & Speed Gates";
  if (/wacom|cintiq|intuos|movink|bamboo|pen\s*display|pen\s*tablet/.test(s)) return "Wacom";
  if (/ubio|nitgen|fingerprint|face|iris|access\s*control|acs|attendance|virdi/.test(s)) return "TNA & ACS";
  if (/ribbon|film|consumable|laminat|card|printer|reader|scanner/.test(s)) return "Consumables";
  return "Other";
}
