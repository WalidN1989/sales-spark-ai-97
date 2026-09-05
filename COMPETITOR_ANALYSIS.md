# Competitor Analysis module

Store dated competitive-research snapshots (feature matrix, strengths, weaknesses,
gaps) linked to a competitor company/product and one of our product categories.
Research can be entered in the UI or POSTed by an external research agent.

## Where it lives
- **Sidebar → Competitor Analysis** (`/app/competitors`)
  - Research list + Competitors tab
  - `/app/competitors/$id` — the comparison dashboard (matrix, strengths,
    weaknesses, gaps, Export HTML, Archive, Delete)
  - `/app/competitors/new` — manual entry form

## Data model (migration `20260905120000_competitor_analysis.sql`)
`competitor_companies`, `competitor_products`, `competitor_research` (append-only
snapshots), `competitor_feature_rows`, `competitor_strengths`,
`competitor_weaknesses`, `competitor_gaps`. RLS: any authenticated user can
read/write (competitive intel is shared team knowledge); Edge Functions use the
service role. A seeded eTOP VMS vs GuestFlow record ships with the migration.

## Ingest API (Edge Functions)
Deploy `create-competitor-research` and `list-competitor-research`
(both `verify_jwt = false` in `config.toml`), then set ONE secret:

```
COMPETITOR_RESEARCH_API_KEY = <a long random string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

### Create a research snapshot
```bash
curl -X POST https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/create-competitor-research \
  -H "x-api-key: YOUR_KEY" -H "content-type: application/json" \
  -d '{
    "research": {
      "title": "eTOP VMS vs GuestFlow (Endless Data)",
      "our_product_name": "eTOP Visitor Management",
      "our_product_url": "https://www.etopme.ae/visitor-management-software/",
      "category": "visitor_management",
      "summary": "Bottom line...",
      "researcher": "Product Research agent",
      "status": "published",
      "sources": [{"label":"GuestFlow page","url":"https://www.zkteco-dubai.com/guestflow.html","type":"website"}],
      "competitor_company": {"name":"Endless Data","aka":["ZKTeco Dubai"],"website":"https://www.zkteco-dubai.com/","regions":["UAE","KSA"],"is_distributor":true,"hardware_brands":["ZKTeco"],"software_strength":"high","positioning":"Authorized ZKTeco distributor"},
      "competitor_product": {"name":"GuestFlow","category":"visitor_management","product_url":"https://www.zkteco-dubai.com/guestflow.html","deployment":["cloud","on_prem"],"status":"active"},
      "feature_matrix": [{"capability":"Emirates ID / Passport","our_assessment":"chip + MRZ OCR","their_assessment":"Emirates ID reader","leader":"us"}],
      "strengths": {"us":["UAE-native Emirates ID journey"],"them":["Authorized ZKTeco channel"]},
      "weaknesses": {"us":["Permanent cards under-sold"],"them":["Thin badge/NDA UX marketing"]},
      "gaps": [{"title":"ZKTeco channel asymmetry","why_it_hurts":"hardware-led deals default to Endless","recommended_action":"position as hardware-agnostic UAE ID/UX layer","priority":"p0","status":"open"}]
    }
  }'
```
Returns `{ "ok": true, "research_id": "...", "company_id": "...", "product_id": "...", "created": true }`.

Behaviour: upserts the company (by name) and product (by company+name+category);
**appends** a new research snapshot every time (history preserved); replace-inserts
the child rows for that snapshot. Works for any `category`
(`visitor_management | time_attendance | meal_management | access_control | turnstile | other`).

### List (for the agent to verify)
```bash
curl "https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1/list-competitor-research?category=visitor_management&status=published" \
  -H "x-api-key: YOUR_KEY"
```

## Local verification checklist
1. Run the migration (Lovable/Supabase). Open **Competitor Analysis** → the seeded
   eTOP vs GuestFlow record shows with matrix / strengths / weaknesses / gaps.
2. `curl` create (above) → a new snapshot appears after refresh.
3. POST the same body twice → two snapshots, one company/product (history kept).
4. `/app/competitors/new` → create a competitor + research manually.
5. Export HTML from a research page downloads a standalone report.

## Assumptions
- Reuses the existing Supabase project, auth shell, header-portal layout, and the
  `create-prospect` x-api-key pattern.
- New tables are namespaced `competitor_*` and do not touch the pre-existing
  `competitor_profiles` / `competitor_contacts` tables (those power the prospect
  Market-Insight panel).
- `our_products` was not created; research stores `our_product_name` / `_url`
  directly (the ingest body provides them), matching the existing Products module
  without coupling.
