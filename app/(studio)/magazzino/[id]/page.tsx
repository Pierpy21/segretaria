import InventoryItemPage from "@/app/components/modules/inventory-item-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InventoryItemPage id={id} />;
}
