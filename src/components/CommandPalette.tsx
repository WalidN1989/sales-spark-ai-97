import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Flame, Package, Plus } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { listCompanies } from "@/lib/companies.functions";
import { listLeads } from "@/lib/leads.functions";
import { listProducts } from "@/lib/products.functions";

const isTypingTarget = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const companiesFn = useServerFn(listCompanies);
  const leadsFn = useServerFn(listLeads);
  const productsFn = useServerFn(listProducts);

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => companiesFn(),
    enabled: open,
  });
  const { data: leads = [] } = useQuery({
    queryKey: ["leads"],
    queryFn: () => leadsFn(),
    enabled: open,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsFn(),
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/prospects/new" });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/leads" });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("shortcut:add-lead"));
        }, 50);
        return;
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("shortcut:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("shortcut:open-search", onOpen);
    };
  }, [navigate]);

  const goProspect = (id: string) => {
    setOpen(false);
    navigate({ to: "/app/prospects/$id", params: { id } });
  };
  const goLead = (id: string) => {
    setOpen(false);
    navigate({ to: "/app/leads/$id", params: { id } });
  };
  const goProduct = (id: string) => {
    setOpen(false);
    navigate({ to: "/app/products/$id", params: { id } });
  };
  const goNewProspect = () => {
    setOpen(false);
    navigate({ to: "/app/prospects/new" });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search prospects, leads, products, contacts…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={goNewProspect}>
            <Plus className="mr-2 h-4 w-4" /> Add company
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+I</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              navigate({ to: "/app/leads" });
              setTimeout(
                () => window.dispatchEvent(new CustomEvent("shortcut:add-lead")),
                50,
              );
            }}
          >
            <Flame className="mr-2 h-4 w-4" /> Add lead
            <span className="ml-auto text-xs text-muted-foreground">Ctrl+L</span>
          </CommandItem>
        </CommandGroup>
        {companies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Prospects">
              {companies.slice(0, 100).map((c) => (
                <CommandItem
                  key={`c-${c.id}`}
                  value={`prospect ${c.name} ${c.domain ?? ""} ${c.industry ?? ""} ${c.contact_person ?? ""} ${c.product_service ?? ""}`}
                  onSelect={() => goProspect(c.id)}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <span className="truncate">{c.name}</span>
                  {c.domain && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {c.domain}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {leads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Leads">
              {leads.slice(0, 100).map((l) => (
                <CommandItem
                  key={`l-${l.id}`}
                  value={`lead ${l.contact_person ?? ""} ${l.contact_email ?? ""} ${l.company_name ?? ""} ${l.companies?.name ?? ""} ${l.products_services ?? ""} ${l.brands ?? ""}`}
                  onSelect={() => goLead(l.id)}
                >
                  <Flame className="mr-2 h-4 w-4 text-orange-500" />
                  <span className="truncate">
                    {l.contact_person || l.contact_email || "—"}
                  </span>
                  {(l.company_name || l.companies?.name) && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      @ {l.company_name ?? l.companies?.name}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {products.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Products">
              {products.slice(0, 100).map((p) => (
                <CommandItem
                  key={`p-${p.id}`}
                  value={`product ${p.name} ${p.brand ?? ""} ${p.part_number ?? ""} ${p.category ?? ""}`}
                  onSelect={() => goProduct(p.id)}
                >
                  <Package className="mr-2 h-4 w-4" />
                  <span className="truncate">{p.name}</span>
                  {p.brand && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {p.brand}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
