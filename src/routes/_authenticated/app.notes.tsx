import { createFileRoute } from "@tanstack/react-router";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";

export const Route = createFileRoute("/_authenticated/app/notes")({
  head: () => ({ meta: [{ title: "Notes — Sales Insights" }] }),
  component: NotesPage,
});

function NotesPage() {
  return <NotesWorkspace />;
}
