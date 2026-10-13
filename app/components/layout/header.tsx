"use client";

import { useRouter } from "next/navigation";
import { Search, Plus, Bell, Menu, LogOut } from "lucide-react";
import { useMe, initialsOf } from "@/app/hooks/use-me";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { data: me } = useMe();

  const email = me?.user.email ?? null;
  const studioName = me?.company?.name ?? (me ? "Nessuno studio" : "…");

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="flex-shrink-0 bg-white flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200">

      {/* Mobile Hamburger Menu Toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
        aria-label="Apri menu"
      >
        <Menu size={20} />
      </button>

      {/* Search Input Group */}
      <div className="flex items-center gap-2 flex-1 max-w-xs rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 focus-within:border-blue-500 transition-colors">
        <Search size={14} className="text-slate-400 flex-shrink-0" />
        <input
          type="text"
          className="bg-transparent outline-none flex-1 text-xs sm:text-sm text-slate-900 placeholder-slate-400 min-w-0"
          placeholder="Cerca pazienti, cure…"
        />
      </div>

      {/* Right Actions & Status Elements */}
      <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">

        {/* Primary Action Button */}
        <button className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors whitespace-nowrap">
          <Plus size={14} /> <span className="hidden sm:inline">Nuovo Appuntamento</span><span className="sm:hidden">Appunt.</span>
        </button>

        {/* Secondary Action Button - hidden on small mobile */}
        <button className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors whitespace-nowrap">
          <Plus size={14} /> Nuovo Piano di Cura
        </button>

        {/* AI Agent Status Pill - compact on mobile */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden md:inline">Triage AI:</span> Attivo
        </div>


        {/* Notification Bell */}
        <button className="relative p-2 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Notifiche">
          <Bell size={17} />
        </button>

        {/* Utente & studio */}
        <div className="hidden md:flex flex-col items-end leading-tight min-w-0 max-w-[180px]">
          <span className="text-xs font-semibold text-slate-900 truncate max-w-full" title={studioName}>{studioName}</span>
          <span className="text-[10px] text-slate-500 truncate max-w-full" title={email ?? undefined}>{email ?? ""}</span>
        </div>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white bg-blue-600 flex-shrink-0"
          title={email ?? undefined}
        >
          {initialsOf(email)}
        </div>

        <button
          onClick={signOut}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <LogOut size={13} /> <span className="hidden sm:inline">Esci</span>
        </button>
      </div>
    </header>
  );
}
