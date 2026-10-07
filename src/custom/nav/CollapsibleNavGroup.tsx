import { useEffect, useState, type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/client/components/ui/sidebar";

const STORAGE_PREFIX = "nav-group-open:";

/**
 * A menu group. When `collapsible`, it starts folded (remembering what the
 * user chose) and opens by itself while a page of the group is shown, so the
 * current page is never hidden.
 */
export function CollapsibleNavGroup({
  label,
  collapsible,
  paths,
  children,
}: {
  label: string;
  collapsible?: boolean;
  /** The route templates of the group's entries. */
  paths: string[];
  children: ReactNode;
}) {
  const matches = useMatches();
  const containsCurrentPage = matches.some((match) =>
    paths.includes(match.fullPath.replace(/\/$/, "") || "/"),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!collapsible) return;
    try {
      setOpen(window.localStorage.getItem(STORAGE_PREFIX + label) === "1");
    } catch {
      setOpen(false);
    }
  }, [collapsible, label]);

  const toggle = () =>
    setOpen((previous) => {
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + label,
          previous ? "0" : "1",
        );
      } catch {
        // The choice then lasts for this visit only.
      }
      return !previous;
    });

  const shown = !collapsible || open || containsCurrentPage;

  return (
    <SidebarGroup className="py-1">
      {collapsible ? (
        <SidebarGroupLabel
          render={
            <button
              type="button"
              aria-expanded={shown}
              onClick={toggle}
              className="h-7 w-full cursor-pointer justify-between uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
            />
          }
        >
          {label}
          <ChevronRight
            className={`size-3.5 transition-transform ${shown ? "rotate-90" : ""}`}
            aria-hidden
          />
        </SidebarGroupLabel>
      ) : (
        <SidebarGroupLabel className="h-7 uppercase tracking-wider text-sidebar-foreground/40">
          {label}
        </SidebarGroupLabel>
      )}
      {shown ? (
        <SidebarGroupContent>
          <SidebarMenu>{children}</SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  );
}
