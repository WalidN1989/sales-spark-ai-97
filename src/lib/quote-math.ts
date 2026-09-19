// Pure quotation math — shared by the server functions and the client editor.
// No server imports here so it is safe to bundle on the client. Base line prices
// are AED cents; DDP is spread per-unit and baked in, then converted to the quote
// currency. Ported from the standalone quote tool.

export type DdpConfig = {
  enabled: boolean;
  boq_fixed: number; // AED, flat per shipment
  per_kg: number; // AED per kg
  per_unit: number; // AED per unit
  weight: number; // total shipment weight, kg
};

export const DEFAULT_DDP: DdpConfig = {
  enabled: false,
  boq_fixed: 0,
  per_kg: 0,
  per_unit: 0,
  weight: 0,
};

// Base currency is AED. Rates express: 1 AED = rate * currency. Users edit these;
// the values below are only starting defaults.
export const CURRENCIES = ["AED", "USD", "OMR", "QAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

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
  return Math.round((totalAed / totalUnits) * 100); // AED cents per unit
}

export function computeQuoteTotals(
  items: { qty: number; unit_price_cents: number }[],
  currency: string,
  exchangeRate: number,
  vatRate: number,
  ddp: DdpConfig,
): { items_total_cents: number; vat_cents: number; grand_total_cents: number } {
  const rate = Number(exchangeRate) || 1;
  const ddpUnit = ddpPerUnitAedCents(items, ddp);
  let itemsTotal = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const baseAedCents = Number(it.unit_price_cents) || 0;
    const finalUnitCurCents = Math.round((baseAedCents + ddpUnit) * rate);
    itemsTotal += finalUnitCurCents * qty;
  }
  const vat = Math.round(itemsTotal * ((Number(vatRate) || 0) / 100));
  return {
    items_total_cents: itemsTotal,
    vat_cents: vat,
    grand_total_cents: itemsTotal + vat,
  };
}

// cents -> "1,234.00"
export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return "0.00";
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
