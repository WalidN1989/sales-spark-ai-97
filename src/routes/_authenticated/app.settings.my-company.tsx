import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyCompany, upsertMyCompany } from "@/lib/my-company.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/settings/my-company")({
  component: MyCompanyPage,
});

function MyCompanyPage() {
  const get = useServerFn(getMyCompany);
  const save = useServerFn(upsertMyCompany);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["my-company"], queryFn: () => get() });
  const [form, setForm] = useState({
    company_name: "",
    industry: "",
    products_services: "",
    strengths: "",
    target_niche: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        company_name: data.company_name ?? "",
        industry: data.industry ?? "",
        products_services: data.products_services ?? "",
        strengths: data.strengths ?? "",
        target_niche: data.target_niche ?? "",
      });
    }
  }, [data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await save({ data: form });
    qc.invalidateQueries({ queryKey: ["my-company"] });
    toast.success("Saved");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My company profile</CardTitle>
        <CardDescription>
          Used as context when AI drafts pitch emails and research summaries for your prospects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Company name</Label>
            <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Products & services offered</Label>
            <Textarea value={form.products_services} onChange={(e) => setForm({ ...form, products_services: e.target.value })} rows={3} />
          </div>
          <div className="sm:col-span-2">
            <Label>Key strengths & differentiators</Label>
            <Textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} rows={3} />
          </div>
          <div className="sm:col-span-2">
            <Label>Target niche / industries</Label>
            <Textarea value={form.target_niche} onChange={(e) => setForm({ ...form, target_niche: e.target.value })} rows={2} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
