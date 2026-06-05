import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { getProduct, upsertProduct } from "@/lib/products.functions";
import { ProductForm, type ProductFormValues } from "@/components/products/ProductForm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/products/$id")({
  head: () => ({ meta: [{ title: "Edit Product — Sales Insights" }] }),
  component: EditProduct,
});

function EditProduct() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fn = useServerFn(getProduct);
  const upsert = useServerFn(upsertProduct);
  const { data, isLoading } = useQuery({ queryKey: ["product", id], queryFn: () => fn({ data: { id } }) });

  const save = useMutation({
    mutationFn: (values: ProductFormValues) => upsert({ data: { id, patch: values } }),
    onSuccess: () => {
      toast.success("Saved");
      navigate({ to: "/app/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/products">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Edit product</h1>
      <ProductForm initial={data} onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />
    </div>
  );
}
