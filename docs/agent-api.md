# Sales Insights — Agent API

The contract for Grok, Cursor and any other agent reading or writing Sales
Insights without a browser login. Every route is a Supabase Edge Function that
speaks JSON over HTTPS.

**Base URL:** `https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1`

**Start here:** call `agent-describe`. It lists every module, what each can
do, and which route serves each capability. Modules added later appear there
automatically, so an agent never needs a code change to find them.

---

## 1. Auth

| Header | Required | Value |
|---|---|---|
| `x-api-key` | yes | `AGENT_API_KEY` (preferred), or the module's older key |
| `x-agent-name` | no | Who is calling, e.g. `Canteen Leads`. Used for audit fields that exist |
| `content-type` | on POST/PATCH | `application/json` |

`AGENT_API_KEY` works on **every** route below. The older keys keep working on
the routes they always worked on:

| Older key | Still accepted on |
|---|---|
| `PROSPECT_WEBHOOK_KEY` | prospects, leads, ICP routes |
| `PAYMENT_FOLLOWUP_API_KEY` | payment follow-up routes |
| `COMPETITOR_RESEARCH_API_KEY` | competitor routes |

A missing or wrong key returns `401`. Secrets live only in Supabase → Edge
Functions → Secrets. Never put a key in a prompt, a commit or a URL.

Rows an agent creates belong to `PROSPECT_WEBHOOK_USER_ID`, the same owner the
web UI's manager view sees.

## 2. Conventions

- Success: `{ "ok": true, ... }`
- Error: `{ "ok": false, "error": "..." }` — `400` validation, `401` auth,
  `404` not found, `405` wrong method, `500` unexpected. (The older module
  routes return `{ "error": "..." }` without `ok`; same status codes.)
- Lists take `limit` (default 100, max 500) and `offset`, and return `total`.
- Updates change only the fields sent. An empty string clears a text field.
- Enum values are validated; the error message lists the allowed values.
- **Never invent contact details.** If a phone or email is not known, omit it.
  Phone is never required anywhere.

```bash
export SI=https://qygugdjyiebhnlwhhbwi.supabase.co/functions/v1
export KEY=...   # AGENT_API_KEY, from your secret store
```

## 3. Discovery

```bash
curl -s "$SI/agent-describe" -H "x-api-key: $KEY"
```

Returns `app`, `base_url`, `auth`, `conventions` and `modules[]`, each with
`id`, `title`, `capabilities` and `routes` (capability → function name).

## 4. Prospects

Prospects are rows in `companies`. Activity is recorded on the company's
primary lead, which is how the Activity Journal in the UI shows it.

| Capability | Method | Route |
|---|---|---|
| list | GET/POST | `list-prospects` |
| get | GET/POST | `get-prospect` |
| create | POST | `create-prospect` |
| update | POST/PATCH | `update-prospect` |
| log_activity | POST | `log-prospect-activity` |
| log_quote | POST | `log-quote-activity` |
| activity_summary | GET/POST | `prospect-activity-summary` |
| promote_to_lead | POST | `promote-prospect-to-lead` |

**List.** Filters: `product_service`, `country`, `industry`, `status`
(`hot|warm|cold|won|lost`), `q` (name, domain, contact), `has_activity`
(`true|false`, narrows the returned page), `limit`, `offset`. Each row carries
`primary_lead_id`, `pipeline_stage`, `last_activity_kind`, `last_activity_at`,
`has_activity`.

```bash
curl -s "$SI/list-prospects?product_service=Canteen%20Management%20System&country=UAE&limit=50" -H "x-api-key: $KEY"
```

**Get** by `id` or `company` name. Returns the prospect, its leads, the last 50
activities and open reminders.

```bash
curl -s "$SI/get-prospect?company=Example%20Catering" -H "x-api-key: $KEY"
```

**Create** — unchanged. Dedupes by fuzzy company name; returns
`created / skipped / failed / ids`.

```bash
curl -s -X POST "$SI/create-prospect" -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{ "prospects": [ { "company": "Example Catering LLC", "industry": "Industrial Catering",
        "country": "UAE", "product_service": "Canteen Management System", "website": "example.com" } ] }'
```

**Update.** Allowed: `name, domain, country, industry, contact_person, email,
phone, mobile, product_service, address, status, is_reseller, employee_count,
linkedin_url`. Unknown fields come back in `ignored`.

```bash
curl -s -X PATCH "$SI/update-prospect" -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{ "id": "<company uuid>", "patch": { "status": "hot", "industry": "Labor Camps" } }'
```

**Log activity** onto a prospect (`company_id` or `company`) or a lead
(`lead_id`). Creates the primary lead if none exists. `followup_hours` adds a
pending reminder.

- `kind`: `note | email | call | meeting | log | whatsapp | quotation | visit`
- `outcome` (optional): `interested | waiting | not_interested | need_quotation |
  need_followup | decision_pending | lost | won | no_response | ignoring`

```bash
curl -s -X POST "$SI/log-prospect-activity" -H "x-api-key: $KEY" -H "x-agent-name: Canteen Leads" \
  -H "content-type: application/json" \
  -d '{ "company_id": "<company uuid>", "kind": "call", "outcome": "interested",
        "body": "Facilities manager wants a demo next week", "followup_hours": 48 }'
```

**Promote to lead.** Idempotent: returns the existing lead and marks it
converted if one exists.

```bash
curl -s -X POST "$SI/promote-prospect-to-lead" -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{ "company_id": "<company uuid>", "pipeline_stage": "qualified", "next_action": "Book demo", "next_action_due": "2026-09-21" }'
```

### Canteen Monday gate

```bash
curl -s "$SI/prospect-activity-summary?product_service=Canteen%20Management%20System&country=UAE" -H "x-api-key: $KEY"
```

```json
{
  "ok": true,
  "total": 25,
  "with_activity": 12,
  "without_activity": 13,
  "fill_rate_pct": 48,
  "positive_activity_count": 3,
  "gate_open": false,
  "gate_rule": "gate_open = fill_rate_pct >= 50 AND positive_activity_count >= 1",
  "positive_rule": { "outcomes": ["interested","need_quotation","decision_pending","won"], "kinds": ["meeting","quotation","visit"] },
  "sampled": []
}
```

Rules:

- `with_activity` — prospects with at least one activity on any of their leads.
- `positive_activity_count` — activities whose outcome is `interested`,
  `need_quotation`, `decision_pending` or `won`, **or** whose kind is
  `meeting`, `quotation` or `visit`.
- `fill_rate_pct` — `round(with_activity / total × 100)`; `0` when `total` is 0.
- `gate_open` — `fill_rate_pct >= 50 AND positive_activity_count >= 1`.
- Optional `since=<ISO date>` counts only activity on or after that date.

The database has no `callback`, `demo` or `quote_sent` outcomes. Log a demo as
`kind: meeting` and a quote as `kind: quotation`; both count as positive.

## 5. Leads

| Capability | Method | Route |
|---|---|---|
| list | GET/POST | `list-leads` |
| get | GET/POST | `get-lead` |
| update | POST/PATCH | `update-lead` |
| log_activity | POST | `log-prospect-activity` with `lead_id` |
| create | POST | `promote-prospect-to-lead` |

**List.** Filters: `status` (`hot|warm|cold|frozen|dead|won`), `pipeline_stage`
(`prospect|qualified|meeting|quotation|negotiation|purchase_order|won|lost`),
`priority` (`critical|high|medium|low`), `q`, `due_before=YYYY-MM-DD`,
`converted` (`true` default, `false`, `all`).

```bash
curl -s "$SI/list-leads?pipeline_stage=quotation&due_before=2026-09-30" -H "x-api-key: $KEY"
```

**Update.** Allowed: `contact_person, job_title, contact_email, whatsapp, phone,
website, status, pipeline_stage, priority, next_action, next_action_due,
pipeline_value_aed, notes, end_user_project`.

```bash
curl -s -X PATCH "$SI/update-lead" -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{ "id": "<lead uuid>", "patch": { "pipeline_stage": "negotiation", "pipeline_value_aed": 18500 } }'
```

## 6. Product ICP

Read-only for agents. Cards are maintained in the UI, and every card is owned by
the webhook owner, so the agent sees exactly what the UI shows.

```bash
curl -s "$SI/list-icp-profiles?name=Wacom" -H "x-api-key: $KEY"
```

## 7. Payment Follow-up

Unchanged routes, now also accepting `AGENT_API_KEY`. Full field reference in
`PAYMENT_FOLLOWUP.md`.

| Capability | Route |
|---|---|
| list | `list-payment-followups` |
| upsert | `upsert-payment-followups` (dedupe: company + category + reference) |
| update | `manage-payment-followup` |
| log_activity | `log-payment-followup-activity` |
| needing_reminder | `payment-followups-needing-reminder` |

## 8. Competitor Analysis

Existing routes now also accept `AGENT_API_KEY`. Full ingest shape in
`COMPETITOR_ANALYSIS.md`.

| Capability | Method | Route |
|---|---|---|
| list | GET/POST | `list-competitor-research` |
| get | GET/POST | `get-competitor-research` — snapshot + company, product, features, strengths, weaknesses, gaps |
| create | POST | `create-competitor-research` |
| update | POST | `manage-competitor-research` — `{ "action": "update", "id", "patch": { "status": "archived" } }` |
| catalog | GET/POST | `list-competitor-catalog` — list, or upsert companies and products |

```bash
curl -s "$SI/get-competitor-research?id=<research uuid>" -H "x-api-key: $KEY"
```

```bash
curl -s -X POST "$SI/list-competitor-catalog" -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{ "companies": [ { "name": "Example Distributor", "software_strength": "medium",
        "products": [ { "name": "Example VMS", "category": "visitor_management", "status": "watch" } ] } ] }'
```

## 9. Adding a future module — checklist

A module is not finished until an agent can read and write it. Every PR that
adds a module must:

1. **Register it.** Insert a row into `agent_modules` in the module's migration:
   `id`, `title`, `capabilities`, `edge_functions` (capability → route),
   `legacy_key_name` if it has its own key, `notes`.
2. **Ship the routes.** At minimum `list-<module>`, `get-<module>`, and
   `upsert-<module>` or `create-` + `update-`. Add `log-<module>-activity` if the
   module has a timeline, and `<module>-summary` if agents gate on it.
3. **Use the shared helper.** Import `authorize`, `gate`, `readInput`, `json` and
   `fail` from `supabase/functions/_shared/agent.ts`. Do not hand-roll auth.
4. **Register the routes in `supabase/config.toml`** with `verify_jwt = false`.
5. **Document it here** with one read and one write curl.
6. **Check it.** `agent-describe` lists the module, and the routes answer `401`
   to a bad key and `200` to `AGENT_API_KEY`.

## 10. Engineers: Supabase MCP

For SQL-level access while building, connect Cursor's or Claude Code's Supabase
MCP to project **`qygugdjyiebhnlwhhbwi`** (Sales Insights). That is for people
at a keyboard. Production agents use the routes above: they validate input,
enforce the owner, and keep a stable contract when the schema moves.
