"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import Sidebar from "./sidebar";
import Header from "./header";
import { currentNavItem, navText, type NavArea } from "@/app/constants/navigation";
import { useMe, roleLabel } from "@/app/hooks/use-me";
import { useTerms } from "@/app/hooks/use-terms";

interface AppShellProps {
  area: NavArea;
  children: ReactNode;
}

const noopSubscribe = () => () => {};

/** Data odierna in italiano, es. "Martedì, 13 ottobre 2026" (fuso del browser). */
function formatToday(): string {
  const d = new Date();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const weekday = new Intl.DateTimeFormat("it-IT", { weekday: "long" }).format(d);
  const date = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
  return `${cap(weekday)}, ${date}`;
}

/** Shell comune dei group (studio / contabile): sidebar, header e titolo dalla config di navigazione. */
export default function AppShell({ area, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const terms = useTerms();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Server snapshot null: nessun mismatch di idratazione (la data è calcolata solo lato client)
  const today = useSyncExternalStore(noopSubscribe, formatToday, () => null);

  const studioName = me?.company?.name ?? null;
  const honorific = roleLabel(me);
  const lastName = me?.user.lastName ?? null;
  const current = currentNavItem(area, pathname);
  const isDashboard = area === "studio" && pathname === "/";
  const { title, subtitle } = isDashboard
    ? {
        // Con il cognome noto il titolo è personale (es. "Titolare Rossi"), altrimenti nome dello studio
        title: lastName && honorific ? `${honorific} ${lastName}` : (studioName ?? "Dashboard"),
        subtitle: today ? `${today} — Benvenuto${studioName ? ` · ${studioName}` : ""}` : "",
      }
    : {
        title: current ? navText(current.title, terms) : "",
        subtitle: current ? navText(current.subtitle, terms) : "",
      };

  // Ritorno da OAuth: /?module=calendar&sync=google-ok|google-error → /agenda con esito
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sync = params.get("sync");
    if (params.get("module") === "calendar") {
      router.replace(`/agenda${sync ? `?sync=${encodeURIComponent(sync)}` : ""}`);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizzazione con URL (ritorno OAuth)
    if (sync === "google-ok") setSyncNotice({ type: "success", text: "Google Calendar collegato con successo." });
    else if (sync === "google-error") setSyncNotice({ type: "error", text: "Connessione a Google Calendar non riuscita. Riprova." });
    if (sync) window.history.replaceState(null, "", window.location.pathname);
  }, [pathname, router]);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = setTimeout(() => setSyncNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [syncNotice]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">

      <Sidebar area={area} isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">

          {/* Sync notice (ritorno OAuth) */}
          {syncNotice && (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs font-semibold
                ${syncNotice.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}
            >
              <span>{syncNotice.text}</span>
              <button onClick={() => setSyncNotice(null)} className="p-0.5 opacity-60 hover:opacity-100" title="Chiudi" aria-label="Chiudi">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Page Heading */}
          <div>
            <h1 className="text-base sm:text-lg font-bold text-ink">{title}</h1>
            <p className="text-xs text-ink-muted">{subtitle}</p>
          </div>

          {children}

          {/* Bottom Spacer */}
          <div className="h-2" />
        </main>
      </div>
    </div>
  );
}
