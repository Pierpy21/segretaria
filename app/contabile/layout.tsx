import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentMembership } from "@/lib/db";
import AppShell from "@/app/components/layout/app-shell";

/** Area contabile: profilo contabile e dottore (owner/admin). Lo staff torna alla home. */
export default async function ContabileLayout({ children }: { children: ReactNode }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding");
  if (membership.profile === "staff") redirect("/");

  return <AppShell area="contabile">{children}</AppShell>;
}
