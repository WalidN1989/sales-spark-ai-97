import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export function slugifyCompetitor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type Competitor = {
  name: string;
  website: string | null;
  country: string | null;
  description: string | null;
  source: "seeded" | "ai";
  socials?: Record<string, string | undefined>;
};

export const draftCompetitorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        competitorSlug: z.string().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const [{ data: company }, { data: mine }] = await Promise.all([
      context.supabase
        .from("companies")
        .select("id, name, market_insight")
        .eq("id", data.companyId)
        .single(),
      context.supabase
        .from("my_company")
        .select("*")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!company) throw new Error("Company not found");

    const insight = company.market_insight as { competitors?: Competitor[] } | null;
    const competitor = insight?.competitors?.find(
      (c) => slugifyCompetitor(c.name) === data.competitorSlug,
    );
    if (!competitor) throw new Error("Competitor not found");

    const system = `You write concise, warm B2B outreach emails from one company to another. Output JSON via the tool. Keep body 120-180 words. No placeholders like [Your Name] or [Company]. Reference a specific fact about the recipient when possible.`;

    const user = `SENDER (my company):
${mine ? JSON.stringify(mine, null, 2) : "(not yet set in Settings → My Company)"}

RECIPIENT (competitor of an existing prospect):
Name: ${competitor.name}
Website: ${competitor.website ?? "n/a"}
Country: ${competitor.country ?? "n/a"}
Description: ${competitor.description ?? "n/a"}

GOAL: Introduce ourselves and open a conversation — collaboration, partnership, or how our offering could complement theirs.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_email",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  subject: { type: "string" },
                  body: { type: "string" },
                },
                required: ["subject", "body"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_email" } },
      }),
    });
    if (res.status === 429) throw new Error("Rate limit. Try again shortly.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI did not return an email");
    return JSON.parse(args) as { subject: string; body: string };
  });
