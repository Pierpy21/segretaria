"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMe, roleLabel, initialsOf } from "@/app/hooks/use-me";
import { useSidebarBadges } from "@/app/hooks/use-sidebar-badges";
import { visibleNavItems, type NavArea } from "@/app/constants/navigation";

interface SidebarProps {
  area: NavArea;
  isOpen?: boolean;
  onClose?: () => void;
}

function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export default function Sidebar({ area, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: me } = useMe();
  // Ricaricato anche al cambio di pagina
  const badges = useSidebarBadges(pathname);
  const [signingOut, setSigningOut] = useState(false);

  const items = visibleNavItems(area, me?.company?.role);
  const email = me?.user.email ?? null;
  const studioName = me?.company?.name ?? (me ? "Nessuno studio" : "…");
  const role = roleLabel(me?.company?.role);

  async function signOut() {
    setSigningOut(true);
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-sidebar/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 flex flex-col h-full overflow-hidden bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:w-60 lg:translate-x-0 ${
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}>

      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-hover/60 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-accent">
              <Bot size={15} className="text-accent-ink" />
            </div>
            <span className="text-sidebar-ink font-bold text-lg tracking-tight">
              Segretar<span className="text-accent">IA</span> <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-accent-soft text-accent ml-1">Dental</span>
            </span>
          </div>
          <p className="text-[11px] mt-1.5 font-medium tracking-wide uppercase text-sidebar-ink-muted">
            {area === "contabile" ? "Area contabile" : "Studio Dentistico Smart AI"}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-sidebar-ink-muted hover:text-sidebar-ink hover:bg-sidebar-hover"
            aria-label="Chiudi menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 text-sidebar-ink-muted">
          Menu Principale
        </p>

        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href;
          const count = badge && badges ? badges[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left
                ${active
                  ? "bg-accent text-accent-ink font-semibold"
                  : "bg-transparent text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink"
                }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1 leading-tight text-[13px]">{label}</span>

              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${active ? "bg-accent-ink/20 text-accent-ink" : "bg-accent text-accent-ink"}`}
                >
                  {formatBadge(count)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t border-sidebar-hover/60">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-accent-ink flex-shrink-0 bg-accent"
            title={email ?? undefined}
          >
            {initialsOf(email)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-ink truncate" title={email ?? undefined}>{email ?? "…"}</p>
            <p className="text-[11px] text-sidebar-ink-muted truncate" title={studioName}>
              {role ? `${role} · ${studioName}` : studioName}
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            className="p-1.5 rounded-lg text-sidebar-ink-muted hover:bg-sidebar-hover hover:text-sidebar-ink transition-colors disabled:opacity-50"
            title="Logout"
            aria-label="Esci"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

    </aside>
    </>
  );
}
