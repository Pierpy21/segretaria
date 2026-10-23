import { LayoutDashboard, Users, MessageSquare, Calendar, Wrench, FileText, Wallet, Settings, Package, type LucideIcon } from "lucide-react";
import { can, type AccessProfile, type Permission } from "@/lib/auth/permissions";
import type { MeResponse, SidebarBadges } from "@/app/types/api";
import type { Terms } from "@/app/types/settings";

export type NavArea = "studio" | "contabile";

/** Testo fisso oppure ricavato dalla terminologia dello studio */
export type NavText = string | ((t: Terms) => string);

export function navText(text: NavText, terms: Terms): string {
  return typeof text === "function" ? text(terms) : text;
}

export interface NavItem {
  area: NavArea;
  href: string;
  label: NavText;
  /** Titolo e sottotitolo mostrati nell'header della shell */
  title: NavText;
  subtitle: NavText;
  icon: LucideIcon;
  /** La voce è visibile solo con questo permesso (effettivo: include i moduli attivi) */
  permission: Permission;
  /** Se presente, la voce è visibile solo a questi profili */
  profiles?: AccessProfile[];
  /** Contatore reale in GET /api/badges */
  badge?: keyof SidebarBadges;
}

/** Config unica di menu e intestazioni: sidebar e header la leggono entrambi. */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    area: "studio", href: "/", label: "Dashboard", title: "", subtitle: "",
    icon: LayoutDashboard, permission: "reports:read",
  },
  {
    area: "studio", href: "/clienti", label: t => t.clientPlural,
    title: t => `Elenco & Schede ${t.clientPlural}`,
    subtitle: t => t.clientsSubtitle,
    icon: Users, permission: "clients:read", badge: "patients",
  },
  {
    area: "studio", href: "/chat", label: "Chat",
    title: t => `Chat & Comunicazioni ${t.clientPlural}`,
    subtitle: t => t.chatSubtitle,
    icon: MessageSquare, permission: "chat:read", badge: "chat",
  },
  {
    area: "studio", href: "/agenda", label: "Agenda & Appuntamenti",
    title: "Agenda & Appuntamenti",
    subtitle: t => t.agendaSubtitle,
    icon: Calendar, permission: "calendar:read", badge: "calendar",
  },
  {
    area: "studio", href: "/attivita", label: t => t.tasksLabel,
    title: t => t.tasksLabel,
    subtitle: t => t.tasksSubtitle,
    icon: Wrench, permission: "tasks:read", badge: "tasks",
  },
  {
    area: "studio", href: "/preventivi", label: t => t.quotePlural,
    title: t => t.quotePlural,
    subtitle: t => t.quotesSubtitle,
    icon: FileText, permission: "quotes:read", badge: "quotes",
  },
  {
    area: "studio", href: "/magazzino", label: t => t.inventoryLabel,
    title: t => t.inventoryLabel,
    subtitle: t => t.inventorySubtitle,
    icon: Package, permission: "inventory:read", badge: "inventory",
  },
  {
    area: "studio", href: "/contabile", label: "Area contabile",
    title: "Area contabile", subtitle: "Riepilogo economico, preventivi e anagrafica dello studio",
    icon: Wallet, permission: "payments:read", profiles: ["titolare"],
  },
  {
    area: "studio", href: "/impostazioni", label: "Impostazioni",
    title: "Impostazioni",
    subtitle: "Settore, moduli, terminologia, tipi di appuntamento e ruoli dello studio",
    icon: Settings, permission: "settings:manage", profiles: ["titolare"],
  },
  {
    area: "contabile", href: "/contabile", label: "Riepilogo",
    title: "Riepilogo economico", subtitle: "Preventivi, accettazioni e importi dello studio",
    icon: LayoutDashboard, permission: "reports:read",
  },
  {
    area: "contabile", href: "/contabile/preventivi", label: t => t.quotePlural,
    title: t => t.quotePlural,
    subtitle: t => t.quotesSubtitle,
    icon: FileText, permission: "quotes:read",
  },
  {
    area: "contabile", href: "/contabile/clienti", label: t => t.clientPlural,
    title: t => `Anagrafica ${t.clientPlural}`,
    subtitle: t => t.clientsSubtitle,
    icon: Users, permission: "clients:read",
  },
  {
    area: "contabile", href: "/", label: "Area studio",
    title: "", subtitle: "",
    icon: LayoutDashboard, permission: "reports:read", profiles: ["titolare"],
  },
];

/**
 * Voce di menu della pagina corrente: corrispondenza esatta oppure per prefisso (es. /magazzino/[id]
 * → /magazzino). Con più corrispondenze vince quella più specifica.
 */
export function currentNavItem(area: NavArea, pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (item.area !== area) continue;
    const matches = item.href === pathname || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Voci dell'area visibili all'utente: permesso effettivo (ruolo o ruolo personalizzato, moduli attivi)
 * e profilo. Vuoto se non c'è uno studio.
 */
export function visibleNavItems(area: NavArea, me: MeResponse | null | undefined): NavItem[] {
  if (!me?.company) return [];
  return NAV_ITEMS.filter(
    item =>
      item.area === area &&
      can(me.permissions, item.permission) &&
      (!item.profiles || (me.profile !== null && item.profiles.includes(me.profile)))
  );
}
