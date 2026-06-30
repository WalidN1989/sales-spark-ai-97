import { ExternalLink, UserPlus, Building2, Check, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type VisualMatchRow = {
  id: string;
  position: number;
  title: string | null;
  source: string | null;
  source_domain: string | null;
  link: string;
  thumbnail_url: string | null;
  saved_lead_id: string | null;
  saved_company_id: string | null;
};

export function MatchCard({
  match,
  onSaveProspect,
  onSaveLead,
}: {
  match: VisualMatchRow;
  onSaveProspect: (m: VisualMatchRow) => void;
  onSaveLead: (m: VisualMatchRow) => void;
}) {
  const isLinkedIn = /linkedin\.com/i.test(match.link);
  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      <a
        href={match.link}
        target="_blank"
        rel="noreferrer"
        className="block aspect-square bg-muted relative overflow-hidden"
      >
        {match.thumbnail_url ? (
          <img
            src={match.thumbnail_url}
            alt={match.title ?? "match"}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
            No thumb
          </div>
        )}
        {isLinkedIn && (
          <Badge className="absolute top-2 left-2 bg-[#0a66c2] text-white border-0">
            <Linkedin className="h-3 w-3 mr-1" />
            LinkedIn
          </Badge>
        )}
      </a>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="text-xs text-muted-foreground truncate">
          {match.source ?? match.source_domain ?? "—"}
        </div>
        <div className="text-sm font-medium line-clamp-3 min-h-[3rem]">
          {match.title ?? match.link}
        </div>
        <div className="flex items-center gap-1 pt-1 mt-auto">
          <Button asChild size="sm" variant="outline" className="flex-1 h-8 px-2">
            <a href={match.link} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            size="sm"
            variant={match.saved_company_id ? "secondary" : "outline"}
            className="flex-1 h-8 px-2"
            onClick={() => onSaveProspect(match)}
            disabled={!!match.saved_company_id}
            title="Save as Prospect"
          >
            {match.saved_company_id ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Building2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant={match.saved_lead_id ? "secondary" : "default"}
            className="flex-1 h-8 px-2"
            onClick={() => onSaveLead(match)}
            disabled={!!match.saved_lead_id}
            title="Save as Lead"
          >
            {match.saved_lead_id ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
