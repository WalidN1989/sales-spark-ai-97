import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/leads/TagInput";

export type LearningFormValues = {
  category: "writing_style" | "business_rule" | "objection" | "negotiation";
  title: string;
  content: string;
  situation: string | null;
  tags: string[];
};

type Initial = Partial<LearningFormValues>;

export function LearningForm({
  initial,
  onSubmit,
  submitting,
}: {
  initial?: Initial;
  onSubmit: (v: LearningFormValues) => void;
  submitting?: boolean;
}) {
  const [category, setCategory] = useState<LearningFormValues["category"]>(
    initial?.category ?? "writing_style",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [situation, setSituation] = useState(initial?.situation ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      category,
      title: title.trim(),
      content,
      situation: situation.trim() || null,
      tags,
    });
  };

  const contentLabel =
    category === "writing_style"
      ? "Example email / response"
      : category === "business_rule"
        ? "Rule description"
        : category === "objection"
          ? "Recommended response"
          : "Content";

  return (
    <Card>
      <CardContent className="pt-6">
        <form className="grid gap-3" onSubmit={submit}>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as LearningFormValues["category"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="writing_style">Writing Style</SelectItem>
                <SelectItem value="business_rule">Business Rule</SelectItem>
                <SelectItem value="objection">Objection Handling</SelectItem>
                <SelectItem value="negotiation">Negotiation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          {category === "objection" && (
            <div>
              <Label>Situation</Label>
              <Textarea
                rows={2}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="e.g. Customer asks for 30% discount on first order"
              />
            </div>
          )}
          <div>
            <Label>{contentLabel}</Label>
            <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div>
            <Label>Tags</Label>
            <TagInput value={tags} onChange={setTags} placeholder="Type and press Enter" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !title.trim()}>
              Save entry
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
