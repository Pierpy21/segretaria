"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Bell, Menu, LogOut } from "lucide-react";
import { useMe, initialsOf } from "@/app/hooks/use-me";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { can } from "@/lib/auth/permissions";
import { useTerms } from "@/app/hooks/use-terms";
import { fullNameOf } from "@/lib/person-name";
import { ProfileDialog } from "@/app/components/layout/profile-dialog";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { data: me } = useMe();
  const terms = useTerms();
  const [profile, setProfile] = useState<{ opener: HTMLElement | null } | null>(null);

  const email = me?.user.email ?? null;
  const displayName = (me ? fullNameOf(me.user) : null) ?? email ?? "";
  const studioName = me?.company?.name ?? (me ? "Nessuno studio" : "…");
  const canCreateAppointment = can(me?.permissions, "calendar:write");
  const canCreateQuote = can(me?.permissions, "quotes:write");

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="flex-shrink-0 bg-surface flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-line">

      {/* Mobile Hamburger Menu Toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl text-ink hover:bg-surface-muted transition-colors flex-shrink-0"
        aria-label="Apri menu"
      >
        <Menu size={20} />
      </button>

      {/* Search Input Group */}
      <div className="flex items-center gap-2 flex-1 max-w-xs rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm bg-surface-muted border border-line focus-within:border-accent transition-colors">
        <Search size={14} className="text-ink-muted flex-shrink-0" />
        <input
          type="text"
          className="bg-transparent outline-none flex-1 text-xs sm:text-sm text-ink placeholder-ink-muted min-w-0"
          placeholder={`Cerca ${terms.clientPlural.toLowerCase()}…`}
        />
      </div>

      {/* Right Actions & Status Elements */}
      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">

        {/* Primary Action Button */}
        {canCreateAppointment && (
          <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-accent-ink bg-accent hover:bg-accent-hover transition-colors whitespace-nowrap">
            <Plus size={14} /> <span className="hidden sm:inline">Nuovo Appuntamento</span><span className="sm:hidden">Appunt.</span>
          </button>
        )}

        {/* Secondary Action Button - hidden on small mobile */}
        {canCreateQuote && (
          <button className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-ink bg-surface-muted border border-line hover:bg-line transition-colors whitespace-nowrap">
            <Plus size={14} /> Nuovo {terms.quoteSingular}
          </button>
        )}

        {/* AI Agent Status Pill - compact on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden md:inline">Triage AI:</span> Attivo
        </div>


        {/* Notification Bell */}
        <button className="relative p-2 rounded-xl text-ink hover:bg-surface-muted transition-colors" aria-label="Notifiche">
          <Bell size={17} />
        </button>

        {/* Utente & studio */}
        <div className="hidden md:flex flex-col items-end leading-tight min-w-0 max-w-[180px]">
          <span className="text-xs font-semibold text-ink truncate max-w-full" title={studioName}>{studioName}</span>
          <span className="text-[10px] text-ink-muted truncate max-w-full" title={email ?? undefined}>{displayName}</span>
        </div>
        {me && (
          <button
            type="button"
            onClick={e => setProfile({ opener: e.currentTarget })}
            aria-label="Il tuo profilo"
            title={email ?? undefined}
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-accent-ink bg-accent-hover flex-shrink-0 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {initialsOf(displayName || null)}
          </button>
        )}

        <button
          onClick={signOut}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold text-ink-muted hover:bg-surface-muted transition-colors"
        >
          <LogOut size={13} /> <span className="hidden sm:inline">Esci</span>
        </button>
      </div>

      {profile && me && (
        <ProfileDialog me={me} opener={profile.opener} onClose={() => setProfile(null)} />
      )}
    </header>
  );
}
