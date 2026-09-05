import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createCompetitorResearchManual } from "@/lib/competitors.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_OPTIONS, CATEGORY_LABEL } from "@/lib/competitors-ui";

export const Route = createFileRoute("/_authenticated/app/competitors/new")({
  head: () => ({ meta: [{ title: "New research — Sales Insights" }] }),
  component: NewResearch,
});

type FeatureRow = { capability: string; our_assessment: string; their_assessment: string; leader: string };
type GapRow = { title: string; why_it_hurts: string; recommended_action: string; priority: string };

function NewResearch() {
  const navigate = useNavigate();
  const createFn = useServerFn(createCompetitorResearchManual);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("visitor_management");
  const [ourName, setOurName] = useState("");
  const [ourUrl, setOurUrl] = useState("");
  const [summary, setSummary] = useState("");

  const [coName, setCoName] = useState("");
  const [coWebsite, setCoWebsite] = useState("");
  const [coRegions, setCoRegions] = useState("");
  const [coDistributor, setCoDistributor] = useState(false);
  const [coSoftware, setCoSoftware] = useState<string>("");
  const [coPositioning, setCoPositioning] = useState("");
  const [prodName, setProdName] = useState("");
  const [prodUrl, setProdUrl] = useState("");

  const [features, setFeatures] = useState<FeatureRow[]>([{ capability: "", our_assessment: "", their_assessment: "", leader: "us" }]);
  const [usStrengths, setUsStrengths] = useState("");
  const [themStrengths, setThemStrengths] = useState("");
  const [usWeak, setUsWeak] = useState("");
  const [themWeak, setThemWeak] = useState("");
  const [gaps, setGaps] = useState<GapRow[]>([{ title: "", why_it_hurts: "", recommended_action: "", priority: "p1" }]);
  const [busy, setBusy] = useState(false);

  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!coName.trim()) return toast.error("Competitor company name is required");
    setBusy(true);
    try {
      const res = await createFn({
        data: {
          title: title.trim(),
          category: category as (typeof CATEGORY_OPTIONS)[number],
          our_product_name: ourName || null,
          our_product_url: ourUrl || null,
          summary: summary || null,
          researcher: "Manual entry",
          status: "published",
          company: {
            name: coName.trim(),
            website: coWebsite || null,
            regions: coRegions.split(",").map((s) => s.trim()).filter(Boolean),
            hardware_brands: [],
            is_distributor: coDistributor,
            software_strength: (coSoftware || null) as "low" | "medium" | "high" | null,
            positioning: coPositioning || null,
          },
          product: prodName ? { name: prodName, product_url: prodUrl || null } : undefined,
          feature_matrix: features
            .filter((f) => f.capability.trim())
            .map((f) => ({
              capability: f.capability.trim(),
              our_assessment: f.our_assessment || null,
              their_assessment: f.their_assessment || null,
              leader: (f.leader || null) as "us" | "them" | "even" | "unknown" | null,
            })),
          strengths: { us: lines(usStrengths), them: lines(themStrengths) },
          weaknesses: { us: lines(usWeak), them: lines(themWeak) },
          gaps: gaps
            .filter((g) => g.title.trim())
            .map((g) => ({
              title: g.title.trim(),
              why_it_hurts: g.why_it_hurts || null,
              recommended_action: g.recommended_action || null,
              priority: g.priority as "p0" | "p1" | "p2",
              status: "open" as const,
            })),
        },
      });
      toast.success("Research created");
      navigate({ to: "/app/competitors/$id", params: { id: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/competitors">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New competitive research</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="eTOP VMS vs GuestFlow (Endless Data)" />
            </div>
            <div>
              <Label>Product category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div />
            <div>
              <Label>Our product name</Label>
              <Input value={ourName} onChange={(e) => setOurName(e.target.value)} placeholder="eTOP Visitor Management" />
            </div>
            <div>
              <Label>Our product URL</Label>
              <Input value={ourUrl} onChange={(e) => setOurUrl(e.target.value)} placeholder="https://www.etopme.ae/..." />
            </div>
            <div className="sm:col-span-2">
              <Label>Executive summary</Label>
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Bottom line in 2–4 sentences…" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Competitor</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Company name *</Label>
            <Input value={coName} onChange={(e) => setCoName(e.target.value)} placeholder="Endless Data" />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={coWebsite} onChange={(e) => setCoWebsite(e.target.value)} placeholder="zkteco-dubai.com" />
          </div>
          <div>
            <Label>Regions (comma-separated)</Label>
            <Input value={coRegions} onChange={(e) => setCoRegions(e.target.value)} placeholder="UAE, KSA, Africa" />
          </div>
          <div>
            <Label>Software strength</Label>
            <Select value={coSoftware} onValueChange={setCoSoftware}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Product name</Label>
            <Input value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="GuestFlow" />
          </div>
          <div>
            <Label>Product URL</Label>
            <Input value={prodUrl} onChange={(e) => setProdUrl(e.target.value)} placeholder="https://…/guestflow.html" />
          </div>
          <div className="sm:col-span-2">
            <Label>Positioning</Label>
            <Input value={coPositioning} onChange={(e) => setCoPositioning(e.target.value)} placeholder="Authorized ZKTeco distributor with strong custom software" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={coDistributor} onChange={(e) => setCoDistributor(e.target.checked)} />
            Is a distributor
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Feature matrix</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {features.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-center">
              <Input placeholder="Capability" value={f.capability} onChange={(e) => setFeatures((a) => a.map((x, j) => (j === i ? { ...x, capability: e.target.value } : x)))} />
              <Input placeholder="Us" value={f.our_assessment} onChange={(e) => setFeatures((a) => a.map((x, j) => (j === i ? { ...x, our_assessment: e.target.value } : x)))} />
              <Input placeholder="Them" value={f.their_assessment} onChange={(e) => setFeatures((a) => a.map((x, j) => (j === i ? { ...x, their_assessment: e.target.value } : x)))} />
              <Select value={f.leader} onValueChange={(v) => setFeatures((a) => a.map((x, j) => (j === i ? { ...x, leader: v } : x)))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">Us</SelectItem>
                  <SelectItem value="them">Them</SelectItem>
                  <SelectItem value="even">Even</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setFeatures((a) => a.filter((_, j) => j !== i))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setFeatures((a) => [...a, { capability: "", our_assessment: "", their_assessment: "", leader: "us" }])}>
            <Plus className="mr-1 h-4 w-4" /> Add feature row
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Strengths & weaknesses (one per line)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div><Label>Our strengths</Label><Textarea rows={4} value={usStrengths} onChange={(e) => setUsStrengths(e.target.value)} /></div>
          <div><Label>Their strengths</Label><Textarea rows={4} value={themStrengths} onChange={(e) => setThemStrengths(e.target.value)} /></div>
          <div><Label>Our weaknesses</Label><Textarea rows={4} value={usWeak} onChange={(e) => setUsWeak(e.target.value)} /></div>
          <div><Label>Their weaknesses</Label><Textarea rows={4} value={themWeak} onChange={(e) => setThemWeak(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Gaps</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {gaps.map((g, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input placeholder="Gap title" value={g.title} onChange={(e) => setGaps((a) => a.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <Select value={g.priority} onValueChange={(v) => setGaps((a) => a.map((x, j) => (j === i ? { ...x, priority: v } : x)))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p0">P0</SelectItem>
                    <SelectItem value="p1">P1</SelectItem>
                    <SelectItem value="p2">P2</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => setGaps((a) => a.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input placeholder="Why it hurts" value={g.why_it_hurts} onChange={(e) => setGaps((a) => a.map((x, j) => (j === i ? { ...x, why_it_hurts: e.target.value } : x)))} />
              <Input placeholder="Recommended action" value={g.recommended_action} onChange={(e) => setGaps((a) => a.map((x, j) => (j === i ? { ...x, recommended_action: e.target.value } : x)))} />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setGaps((a) => [...a, { title: "", why_it_hurts: "", recommended_action: "", priority: "p1" }])}>
            <Plus className="mr-1 h-4 w-4" /> Add gap
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="ghost" onClick={() => navigate({ to: "/app/competitors" })}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save research"}</Button>
      </div>
    </div>
  );
}
