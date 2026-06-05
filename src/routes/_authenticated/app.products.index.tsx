import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { listProducts, deleteProduct } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/products/")({
  head: () => ({ meta: [{ title: "Products — Sales Insights" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const fn = useServerFn(listProducts);
  const del = useServerFn(deleteProduct);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (data ?? []).filter((p) => {
    const s = q.toLowerCase();
    return (
      !s ||
      p.name?.toLowerCase().includes(s) ||
      p.brand?.toLowerCase().includes(s) ||
      p.part_number?.toLowerCase().includes(s) ||
      p.category?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Pricing and product context for the Respond tab.
          </p>
        </div>
        <Button onClick={() => navigate({ to: "/app/products/new" })}>
          <Plus className="mr-1 h-4 w-4" /> Add product
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, brand, part #…" className="pl-9" />
      </div>

      <Card>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {q ? "No matches." : "No products yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Part #</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Selling</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.brand ?? "—"}</TableCell>
                  <TableCell className="font-medium">
                    <Link to="/app/products/$id" params={{ id: p.id }} className="hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.part_number ?? "—"}</TableCell>
                  <TableCell>{p.category ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">
                    {p.cost_price_cents != null
                      ? `${(p.cost_price_cents / 100).toLocaleString()} ${p.currency}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs">
                    {p.selling_price_cents != null
                      ? `${(p.selling_price_cents / 100).toLocaleString()} ${p.currency}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{p.stock_status ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app/products/$id", params: { id: p.id } })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete ${p.name}?`)) remove.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
