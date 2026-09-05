# Payment Follow-up module

Track money + logistics follow-ups (PDCs, collections, PO/payment-advice, demo
units, consignment) with an activity timeline, and feed a 3×/week reminder
assistant.

## Where it lives
- **Sidebar → Payment Follow-up** (`/app/payments`)
  - List with category chips, search, "Needs reminder" filter, "Show resolved"
  - `/app/payments/$id` — item detail: header, editable fields, quick actions
    (Log call / WhatsApp / activity, Mark resolved), activity timeline
  - `/app/payments/new` — manual create

## Reminder contract (Asia/Dubai)
| When | Behavior |
|---|---|
| **Mon 10:00** | Always list all non-resolved items (`list-payment-followups`) |
| **Wed 11:00** | Only items with **no activity since Mon 10:00** (`payment-followups-needing-reminder` with `since` = Monday 10:00 Dubai) |
| **Fri 11:00** | Same as Wednesday |

Logging any activity (UI or API) bumps `last_activity_at`, which removes the item
from the Wed/Fri "needs reminder" feed until the next Monday window resets.

## Data model (migration `20260905130000_payment_followups.sql`)
`payment_followups` + `payment_followup_activities`. An `AFTER INSERT` trigger on
activities keeps `payment_followups.last_activity_at` current. Shared-team RLS
(any authenticated user); Edge Functions use the service role. Seeded with the
current open set (Techsys PDCs/collection, National Bonds / Digital Dimension /
Burjeel PI advice, L&T / LM Exchange / GCC demo units, Trios / Al Bareeq / Emsys
consignment).

## Assistant APIs (Edge Functions)
All authenticate with `x-api-key: <PAYMENT_FOLLOWUP_API_KEY>` (one Supabase
secret to set; `verify_jwt = false` in `config.toml`).

### Monday digest — all open items
```bash
curl "https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/list-payment-followups" -H "x-api-key: YOUR_KEY"
# optional: ?status=open&category=pending_pdc
```

### Wed/Fri — items needing a nudge
```bash
curl -X POST https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/payment-followups-needing-reminder \
  -H "x-api-key: YOUR_KEY" -H "content-type: application/json" \
  -d '{"since":"2026-09-07T10:00:00+04:00"}'
```
Returns open items with `last_activity_at` null or `< since`. Empty ⇒ stay silent.

### Upsert items
```bash
curl -X POST https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/upsert-payment-followups \
  -H "x-api-key: YOUR_KEY" -H "content-type: application/json" \
  -d '{"items":[{"company_name":"Techsys Technology LLC","category":"pending_pdc","reference":"26391","title":"Inv. 26391 PDC","amount_aed":13230,"due_date":"2026-09-18","status":"open"}]}'
```
Dedupe: `(company_name, category, reference)` when reference present, else
`(company_name, category, title)`. Returns `{ created, updated, skipped, failed, ids }`.

### Log activity (suppresses Wed/Fri nudge)
```bash
curl -X POST https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/log-payment-followup-activity \
  -H "x-api-key: YOUR_KEY" -H "content-type: application/json" \
  -d '{"company_name":"Techsys Technology LLC","category":"pending_pdc","reference":"26391","activity_type":"call","summary":"Called accounts — PDC clears next week","created_by":"Walid"}'
```
Resolve by `followup_id`, or by `company_name` + `category` (+ `reference`).

## Categories
`pending_pdc | pending_collection | pending_po_payment_advice | demo_unit | consignment`

## Activity types
`call | whatsapp | email | visit | note | document_sent | payment_received | collection_done | other`

## Smoke test
1. Run migration → **Payment Follow-up** shows the seeded open items.
2. Create an item in the UI → appears in the list.
3. Log an activity → `last_activity_at` updates; "Needs reminder" count drops.
4. `payment-followups-needing-reminder` with `since` after that activity excludes it.
5. Mark an item resolved → it drops off the Monday `list-payment-followups` feed.

## Assumptions
- Reuses the Supabase project, auth, layout shell, header-portal pattern, and the
  `create-prospect` x-api-key convention.
- Shared-team RLS (competitive/ops data is not per-user-owned).
- `prospect_id` is an optional link, not enforced — this is a standalone ops module.
