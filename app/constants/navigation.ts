import { LayoutDashboard, Users, MessageSquare, Calendar, Wrench, FileText, Wallet, type LucideIcon } from "lucide-react";
import { hasPermission, profileOf, type AccessProfile, type Permission } from "@/lib/auth/permissions";
import type { CompanyRole, SidebarBadges } from "@/app/types/api";

export type NavArea = "studio" | "contabile";

export interface NavItem {
  area: NavArea;
  href: string;
  label: string;
  /** Titolo e sottotitolo mostrati nell'header della shell */
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** La voce è visibile solo con questo permesso */
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
    area: "studio", href: "/clienti", label: "Clienti",
    title: "Elenco & Schede Clienti",
    subtitle: "Anagrafica studio, storico prestazioni e schede con campi del settore",
    icon: Users, permission: "clients:read", badge: "patients",
  },
  {
    area: "studio", href: "/chat", label: "Chat",
    title: "Chat & Comunicazioni Pazienti",
    subtitle: "Triage urgenze odontoiatriche, recall semestrali e messaggistica WhatsApp",
    icon: MessageSquare, permission: "chat:read", badge: "chat",
  },
  {
    area: "studio", href: "/agenda", label: "Agenda & Appuntamenti",
    title: "Agenda & Appuntamenti",
    subtitle: "Planning poltrone cliniche, igiene e chirurgia sincronizzato con Google/Apple",
    icon: Calendar, permission: "calendar:read", badge: "calendar",
  },
  {
    area: "studio", href: "/attivita", label: "Attività Cliniche & Studio",
    title: "Attività Cliniche & Studio",
    subtitle: "Kanban operativo: sterilizzazione, laboratorio odontotecnico e ordini forniture",
    icon: Wrench, permission: "tasks:read", badge: "tasks",
  },
  {
    area: "studio", href: "/preventivi", label: "Piani di Cura & Preventivi",
    title: "Piani di Cura & Preventivi",
    subtitle: "Preventivi clinici, piani di trattamento 3D e accettazione pazienti",
    icon: FileText, permission: "quotes:read", badge: "quotes",
  },
  {
    area: "studio", href: "/contabile", label: "Area contabile",
    title: "Area contabile", subtitle: "Riepilogo economico, preventivi e anagrafica dello studio",
    icon: Wallet, permission: "payments:read", profiles: ["dottore"],
  },
  {
    area: "contabile", href: "/contabile", label: "Riepilogo",
    title: "Riepilogo economico", subtitle: "Preventivi, accettazioni e importi dello studio",
    icon: LayoutDashboard, permission: "reports:read",
  },
  {
    area: "contabile", href: "/contabile/preventivi", label: "Preventivi",
    title: "Piani di Cura & Preventivi",
    subtitle: "Preventivi clinici, piani di trattamento 3D e accettazione pazienti",
    icon: FileText, permission: "quotes:read",
  },
  {
    area: "contabile", href: "/contabile/clienti", label: "Clienti",
    title: "Anagrafica Clienti", subtitle: "Dati anagrafici e assicurativi dei clienti dello studio",
    icon: Users, permission: "clients:read",
  },
  {
    area: "contabile", href: "/", label: "Area studio",
    title: "", subtitle: "",
    icon: LayoutDashboard, permission: "reports:read", profiles: ["dottore"],
  },
];

/** Voci dell'area visibili al ruolo (permesso + profilo). Vuoto se nessun ruolo. */
export function visibleNavItems(area: NavArea, role: CompanyRole | null | undefined): NavItem[] {
  if (!role) return [];
  const profile = profileOf(role);
  return NAV_ITEMS.filter(
    item =>
      item.area === area &&
      hasPermission(role, item.permission) &&
      (!item.profiles || item.profiles.includes(profile))
  );
}
