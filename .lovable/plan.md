## Add Product/Service to Prospect Cards

Display the existing `product_service` field on every prospect card in the Prospects list, positioned unobtrusively.

### Change
- **File**: `src/routes/_authenticated/app.prospects.index.tsx`
- Add a small italic line rendering `c.product_service` on each card when present.
- Styling: `text-xs italic text-muted-foreground` (readable but subdued), placed on the right side of the Contact row so it doesn't dominate the card. On narrow widths it wraps below.

### Notes
- `product_service` already exists on `companies` and is returned by `listCompanies`; no schema/server changes.
- No changes to the detail page (already shows Product line).