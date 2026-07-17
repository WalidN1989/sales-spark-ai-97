import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanies } from "@/lib/companies.functions";
import { listLeads, promoteToLead } from "@/lib/leads.functions";
import { ProspectsTable, type ProspectRow } from "@/components/prospects/ProspectsTable";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/")({
  head: () => ({ meta: [{ title: "Prospects — Sales Insights" }] }),
  component: ProspectsList,
});

function ProspectsList() {
  const fn = useServerFn(listCompanies);
  const leadsFn = useServerFn(listLeads);
  const promoteFn = useServerFn(promoteToLead);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["companies"], queryFn: () => fn() });
  const { data: leads } = useQuery({ queryKey: ["leads"], queryFn: () => leadsFn() });
  const promotedSet = new Set((leads ?? []).map((l) => l.company_id));

  const promote = useMutation({
    mutationFn: (companyId: string) => promoteFn({ data: { companyId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(res.created ? "Promoted to Lead" : "Already a Lead");
      navigate({ to: "/app/leads" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ProspectsTable
      companies={(data ?? []) as ProspectRow[]}
      promotedSet={promotedSet}
      onPromote={(companyId) => promote.mutate(companyId)}
      isLoading={isLoading}
    />
  );
}
