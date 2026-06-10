import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entityTypeEnum = z.enum(["prospect", "lead", "sale", "meeting", "standalone"]);
const visibilityEnum = z.enum(["private", "shared"]);

const NOTE_SELECT =
  "id, user_id, title, body, body_text, tags, pinned, visibility, entity_type, entity_id, ai_summary, ai_summary_at, created_at, updated_at";

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    entityType?: z.infer<typeof entityTypeEnum>;
    entityId?: string | null;
    search?: string;
    tag?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("notes").select(NOTE_SELECT);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.search && data.search.trim()) {
      const s = data.search.trim().replace(/[%_]/g, "");
      q = q.or(`title.ilike.%${s}%,body_text.ilike.%${s}%`);
    }
    const { data: rows, error } = await q
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    title?: string;
    body?: unknown;
    body_text?: string;
    tags?: string[];
    pinned?: boolean;
    visibility?: z.infer<typeof visibilityEnum>;
    entity_type?: z.infer<typeof entityTypeEnum>;
    entity_id?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().max(500).optional(),
        body: z.any().optional(),
        body_text: z.string().max(50000).optional(),
        tags: z.array(z.string().max(40)).max(20).optional(),
        pinned: z.boolean().optional(),
        visibility: visibilityEnum.optional(),
        entity_type: entityTypeEnum.optional(),
        entity_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const base = {
      title: data.title ?? "",
      body: (data.body ?? {}) as never,
      body_text: data.body_text ?? "",
      tags: data.tags ?? [],
      pinned: data.pinned ?? false,
      visibility: data.visibility ?? "private",
      entity_type: data.entity_type ?? "standalone",
      entity_id: data.entity_id ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("notes")
        .update(base)
        .eq("id", data.id)
        .select(NOTE_SELECT)
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("notes")
      .insert({ ...base, user_id: context.userId })
      .select(NOTE_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return row;

  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePinNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; pinned: boolean }) =>
    z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notes").update({ pinned: data.pinned }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listNoteAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { noteId: string }) => z.object({ noteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("note_attachments")
      .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
      .eq("note_id", data.noteId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const withUrls = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: signed } = await context.supabase.storage
          .from("note-attachments")
          .createSignedUrl(r.storage_path, 3600);
        return { ...r, url: signed?.signedUrl ?? null };
      }),
    );
    return withUrls;
  });

export const recordNoteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    note_id: string;
    storage_path: string;
    file_name: string;
    mime_type?: string;
    size_bytes?: number;
  }) =>
    z
      .object({
        note_id: z.string().uuid(),
        storage_path: z.string().min(1),
        file_name: z.string().min(1).max(255),
        mime_type: z.string().max(100).optional(),
        size_bytes: z.number().int().nonnegative().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("note_attachments")
      .insert({
        note_id: data.note_id,
        user_id: context.userId,
        storage_path: data.storage_path,
        file_name: data.file_name,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteNoteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("note_attachments")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (row?.storage_path) {
      await context.supabase.storage.from("note-attachments").remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("note_attachments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const summarizeNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    entityType: z.infer<typeof entityTypeEnum>;
    entityId?: string | null;
  }) =>
    z
      .object({
        entityType: entityTypeEnum,
        entityId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notes")
      .select("title, body_text, tags, created_at")
      .eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { summary: "No notes yet to summarize." };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Lovable AI is not configured.");

    const corpus = rows
      .map(
        (r, i) =>
          `Note ${i + 1} (${new Date(r.created_at).toISOString().slice(0, 10)}) ${r.title ? "— " + r.title : ""}\n${r.body_text}\nTags: ${(r.tags ?? []).join(", ")}`,
      )
      .join("\n\n---\n\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You summarize CRM notes for sales reps. Output concise markdown with two sections: '## Summary' (3-6 bullet points of key facts/decisions) and '## Suggested next actions' (3-5 actionable bullets). Be specific, not generic.",
          },
          { role: "user", content: corpus },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { summary };
  });
