import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/db";
import AppShell from "@/app/components/layout/app-shell";

/** Area studio: richiede uno studio e non è accessibile al profilo contabile. */
export default async function StudioLayout({ children }: { children: ReactNode }) {
  await connection(); // sessione per richiesta: mai prerender statico
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding");
  if (membership.profile === "contabile") redirect(membership.homePath);

  return <AppShell area="studio">{children}</AppShell>;
}
