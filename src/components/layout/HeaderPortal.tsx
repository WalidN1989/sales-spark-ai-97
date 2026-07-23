// Lets a page render its title / search / actions directly into the app's
// primary header bar, so there's one header row aligned with the notification
// bell instead of a separate strip per page.
//
// Detail pages (a lead / prospect profile) can also hide the global header
// actions via `useHideHeaderActions()` so the profile UI stays clean.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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

// Provided by the app shell; lets a page hide the search + bell in the header.
export const HeaderActionsContext = createContext<((hide: boolean) => void) | null>(null);

export function useHideHeaderActions(hide = true) {
  const set = useContext(HeaderActionsContext);
  useEffect(() => {
    if (!set) return;
    set(hide);
    return () => set(false);
  }, [set, hide]);
}
