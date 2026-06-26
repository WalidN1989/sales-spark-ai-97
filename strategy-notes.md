# Lead Engine — Strategy & Build Brief

> Purpose of this file: a single source of truth for the product vision and the
> open questions to work through. Read this first, then answer the questions at
> the bottom. We build in this repo; this doc is the thinking layer.

---

## 1. The core idea (what's in my mind)

A lead engine that takes one lead and multiplies it into a vertical.

The loop:

1. **Capture** a lead — website, email, contact name, location.
2. **Enrich** the profile into deep intelligence using FireCrawl (crawl),
   Hunter.io (emails), Google Maps API (location/firmographics).
3. **Derive lookalikes & competitors** from the enriched profile.
4. **Expand reach** outward across similar companies and by country —
   one seed becomes an endless pipeline.

On top of the loop, three intelligence plays:

- **Demand signal per company** — figure out what each company is actively
  promoting / investing in (NOT "most sold" — that isn't visible from outside;
  use ads running, featured products, reviews, PR, hiring as proxies). Tools:
  DataForSEO, Perplexity/AI for prediction.
- **Product reverse-index** — paste a product description / service / keyword,
  get back which crawled companies match it, ranked by how prominently they
  feature it (homepage/ad = strong intent; buried = weak).
- **Same-product targeting (ABM)** — when one company buys product X, target its
  lookalikes with the same product for their own use. (e.g. one buyer of a
  Wacom e-signature pad → pitch the whole peer set.)

---

## 2. Where this is going (the vision)

A **fully automated lead + customer-service CRM** that runs with minimal human
intervention:

- Inbound leads arrive via email + WhatsApp.
- The system enriches, scores, and prioritizes them automatically.
- A **WhatsApp Meta API** + **inbound email** layer responds to questions,
  qualifies, and nurtures — human steps in only near the close.
- Sold as a **SaaS product to individual salespeople**, monthly subscription.

Geography is not a constraint: the engine expands by *lookalike + country field*,
and the data APIs (FireCrawl, Hunter, DataForSEO, Maps) are global. Currently
Dubai-based; first go-to-market focus on Sri Lanka. Geography is a marketing
choice, not a technical one.

---

## 3. What's built so far

- A working app (currently on Lovable) with a CRM-style UI.
- Sidebar: Prospects, Qualifying, Leads, Inquiries, Products, Learning, Sales,
  Meetings, Notes, Settings.
- Prospects view = cards per company (name, site, sector, country, contact,
  a freshness timer, and a "flame" / hot-lead marker).

---

## 4. Enrichment roadmap (agreed direction)

Enrichment should mean two things above all: **depth of each prospect's profile**
and **a score that says who to touch first and why.**

**Intelligence profile — 4 stacked layers per company:**
- Firmographics (license type incl. mainland vs free zone, sector, employee band,
  age, branches)
- Decision-makers (the buying committee, not one contact — role, seniority,
  LinkedIn, email, phone)
- Technographics (what stack/tools they already run)
- Live signals (ads currently running, new job posts, PR, expansion news)

**Scoring — two axes, with visible reasons:**
- ICP fit (resemblance to best closed customers — slow-moving)
- Intent / timing (how active & warm this week — from the signal stream)
- Flame = high on both; hover shows the reasons.

**Lookalike engine** — a first-class button on every prospect: seed company →
ranked similar companies + similarity score + match reasons.

**Product reverse-index** — the paste-a-keyword → ranked companies module.

**Data model (target):**

```
companies
  └─ contacts            (FK → companies)
  └─ signals             (append-only: type, value, source, timestamp)
  └─ scores              (fit, intent, reasons, computed_at)
  └─ relationships       (company_a, company_b, type, similarity)
products
  └─ company_products    (link table)
activities               (outreach / interaction log)
```

Signals are **append-only** so scores can move over time instead of going stale.

---

## 5. Tech direction

- **Now:** Lovable + direct git pushes from terminal (Claude Code).
- **Future:** move off Lovable → **Railway** for hosting, **Supabase** for our
  own DB.
- **Automation layer:** WhatsApp Meta API (outbound + inbound replies),
  inbound email parsing.

---

## 6. Questions to work through (answer these)

1. **Sequencing** — given what's built, what do we do next to scale features
   *slowly and steadily*? Give an ordered roadmap, smallest-shippable-first, so
   each step is usable on its own.
2. **Hard parts** — how do we actually achieve the complicated activities
   (multi-layer enrichment, append-only signals → live scoring, lookalike
   similarity, the automated WhatsApp/email response loop)? Where are the real
   engineering risks and how do we de-risk them?
3. **Differentiation** — how is this different from purpose-built lead-gen tools
   (Apollo, ZoomInfo, Clay, Instantly, Lusha, etc.)? What's our actual wedge,
   and where would we lose to them if we're not careful?
4. **The VP lens** — how would an experienced sales VP judge this idea and what's
   built so far? What would impress them, what would they call naive?
5. **The owner lens** — as a business owner, how do we sell this as a SaaS to
   *individual* salespeople on a monthly plan? Pricing, the one feature that
   makes them pay, onboarding, and the wedge offer to land the first 100 users.
6. **APIs to scale** — beyond FireCrawl, Hunter, Maps, DataForSEO, Perplexity:
   what other APIs/data sources should we add for enrichment, intent signals,
   contact data, and the comms layer? Note any that matter specifically for
   UAE / Sri Lanka / wider GCC + South Asia.

Think broad. Treat 3, 4, and 5 as the strategic core — the rest is execution.
