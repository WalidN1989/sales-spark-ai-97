// Lets a page render its title / search / actions directly into the app's
// primary header bar, so there's one header row aligned with the notification
// bell instead of a separate strip per page.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const APP_HEADER_SLOT_ID = "app-header-slot";

export function HeaderPortal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.getElementById(APP_HEADER_SLOT_ID));
  }, []);
  if (!el) return null;
  return createPortal(children, el);
}
