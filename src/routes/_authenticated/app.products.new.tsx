import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { upsertProduct } from "@/lib/products.functions";
import { ProductForm, type ProductFormValues } from "@/components/products/ProductForm";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/products/new")({
  head: () => ({ meta: [{ title: "New Product — Sales Insights" }] }),
  component: NewProduct,
});

function NewProduct() {
  const navigate = useNavigate();
  const upsert = useServerFn(upsertProduct);
  const save = useMutation({
    mutationFn: (values: ProductFormValues) => upsert({ data: { patch: values } }),
    onSuccess: () => {
      toast.success("Product created");
      navigate({ to: "/app/products" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/products">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">New product</h1>
      <ProductForm onSubmit={(v) => save.mutate(v)} submitting={save.isPending} />
    </div>
  );
}
