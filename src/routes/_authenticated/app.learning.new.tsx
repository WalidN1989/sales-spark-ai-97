import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { upsertLearning } from "@/lib/learning.functions";
import { LearningForm, type LearningFormValues } from "@/components/learning/LearningForm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/learning/new")({
  head: () => ({ meta: [{ title: "New Learning Entry" }] }),
  component: NewLearning,
});

function NewLearning() {
  const navigate = useNavigate();
  const upsert = useServerFn(upsertLearning);
  const save = useMutation({
    mutationFn: (values: LearningFormValues) => upsert({ data: { patch: values } }),
    onSuccess: () => {
      toast.success("Saved");
      navigate({ to: "/app/learning" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/learning">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">New learning entry</h1>
      <LearningForm onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />
    </div>
  );
}
