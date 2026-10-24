import { fetchProducts, fetchPromotions } from "@/lib/data-source";
import { PromotionsScreen } from "@/features/promotions/promotions-screen";

export default async function Page() {
  const [promotions, products] = await Promise.all([
    fetchPromotions(),
    fetchProducts(),
  ]);

  return <PromotionsScreen promotions={promotions} products={products} />;
}
