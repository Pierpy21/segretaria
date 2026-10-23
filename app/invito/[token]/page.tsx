import InvitationAccept from "@/app/components/modules/invitation-accept";

/** Accettazione di un invito allo studio (fuori dall'area studio, protetta dal proxy). */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationAccept token={token} />;
}
