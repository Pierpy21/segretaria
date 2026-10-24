"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMe, roleLabel, initialsOf } from "@/app/hooks/use-me";
import { SECTORS } from "@/app/constants/sectors";
import { useSidebarBadges } from "@/app/hooks/use-sidebar-badges";
import { currentNavItem, visibleNavItems, navText, type NavArea } from "@/app/constants/navigation";
import { useTerms } from "@/app/hooks/use-terms";
import { fullNameOf } from "@/lib/person-name";
import { BrandMark } from "@/app/components/brand/brand-mark";
import { BrandWordmark } from "@/app/components/brand/brand-wordmark";

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
  const terms = useTerms();
  // Testi del settore solo quando /api/me è caricato, per non mostrare quelli sbagliati
  const sector = me?.company ? SECTORS[me.company.sector] : null;
  // Ricaricato anche al cambio di pagina
  const badges = useSidebarBadges(pathname);
  const [signingOut, setSigningOut] = useState(false);

  const items = visibleNavItems(area, me);
  const activeHref = currentNavItem(area, pathname ?? "")?.href;
  const email = me?.user.email ?? null;
  const fullName = me ? fullNameOf(me.user) : null;
  const displayName = fullName ?? email;
  const studioName = me?.company?.name ?? (me ? "Nessuno studio" : "…");
  const role = roleLabel(me);

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

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 flex flex-col h-full overflow-hidden bg-brand transition-transform duration-300 ease-in-out lg:static lg:w-60 lg:translate-x-0 ${
        isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
      }`}>

      {/* Logo */}
      <div className="px-5 py-5 border-b border-brand-hover flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <div className="flex items-center gap-1.5 min-w-0">
              <BrandWordmark tone="light" />
              {sector && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-brand-hover text-brand-ink">{sector.badge}</span>}
            </div>
          </div>
          <p className="text-[11px] mt-1.5 font-medium tracking-wide uppercase text-brand-ink-muted">
            {area === "contabile" ? "Area contabile" : sector?.subtitle ?? " "}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-brand-ink-muted hover:text-brand-ink hover:bg-brand-hover"
            aria-label="Chiudi menu"
          >
            ✕
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2 text-brand-ink-muted">
          Menu Principale
        </p>

        {items.map(({ href, label, icon: Icon, badge }) => {
          const text = navText(label, terms);
          const active = href === activeHref;
          const count = badge && badges ? badges[badge] : 0;
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink
                ${active
                  ? "bg-brand-ink text-brand font-semibold"
                  : "bg-transparent text-brand-ink-muted hover:bg-brand-hover hover:text-brand-ink"
                }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1 leading-tight text-[13px]">{text}</span>

              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${active ? "bg-brand text-brand-ink" : "bg-brand-ink text-brand"}`}
                >
                  {formatBadge(count)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="px-4 py-4 border-t border-brand-hover">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-brand flex-shrink-0 bg-brand-ink"
            title={email ?? undefined}
          >
            {initialsOf(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-brand-ink truncate" title={email ?? undefined}>{displayName ?? "…"}</p>
            <p className="text-[11px] text-brand-ink-muted truncate" title={studioName}>
              {role ? `${role} · ${studioName}` : studioName}
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            disabled={signingOut}
            className="p-1.5 rounded-lg text-brand-ink-muted hover:bg-brand-hover hover:text-brand-ink transition-colors disabled:opacity-50"
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
