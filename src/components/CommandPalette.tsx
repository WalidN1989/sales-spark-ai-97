import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Flame, Plus } from "lucide-react";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Open palette with Space when not typing
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
      // Add Company shortcut: Ctrl/Cmd + I (Ctrl+C conflicts with copy; mapped to I = Insert company)
      if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/prospects/new" });
        return;
      }
      // Add Lead shortcut: Ctrl/Cmd + L → dispatches event leads page listens to
      if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        navigate({ to: "/app/leads" });
        // give the route a tick to mount before signalling
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("shortcut:add-lead"));
        }, 50);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const goProspect = (id: string) => {
    setOpen(false);
    navigate({ to: "/app/prospects/$id", params: { id } });
  };
  const goLead = (id: string) => {
    setOpen(false);
    navigate({ to: "/app/leads/$id", params: { id } });
  };
  const goNewProspect = () => {
    setOpen(false);
    navigate({ to: "/app/prospects/new" });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search prospects, leads, or actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/app/prospects/new")}>
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
              {companies.slice(0, 50).map((c) => (
                <CommandItem
                  key={`c-${c.id}`}
                  value={`prospect ${c.name} ${c.domain ?? ""} ${c.industry ?? ""} ${c.contact_person ?? ""}`}
                  onSelect={() => go(`/app/prospects/${c.id}`)}
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
              {leads.slice(0, 50).map((l) => (
                <CommandItem
                  key={`l-${l.id}`}
                  value={`lead ${l.contact_person ?? ""} ${l.contact_email ?? ""} ${l.company_name ?? ""} ${l.companies?.name ?? ""}`}
                  onSelect={() => go(`/app/leads/${l.id}`)}
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
      </CommandList>
    </CommandDialog>
  );
}
