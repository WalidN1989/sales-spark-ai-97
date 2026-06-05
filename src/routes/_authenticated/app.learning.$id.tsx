import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getLearning, upsertLearning } from "@/lib/learning.functions";
import { LearningForm, type LearningFormValues } from "@/components/learning/LearningForm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/learning/$id")({
  head: () => ({ meta: [{ title: "Edit Learning Entry" }] }),
  component: EditLearning,
});

function EditLearning() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(getLearning);
  const upsert = useServerFn(upsertLearning);
  const { data, isLoading } = useQuery({ queryKey: ["learning", id], queryFn: () => fn({ data: { id } }) });

  const save = useMutation({
    mutationFn: (values: LearningFormValues) => upsert({ data: { id, patch: values } }),
    onSuccess: () => {
      toast.success("Saved");
      navigate({ to: "/app/learning" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/learning">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Edit learning entry</h1>
      <LearningForm initial={data} onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />
    </div>
  );
}
