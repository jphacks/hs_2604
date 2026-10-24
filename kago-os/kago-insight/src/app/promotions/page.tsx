import { PromotionsTabs } from "@/features/promotions/promotions-tabs";
import { fetchProducts, fetchPromotions } from "@/lib/data-source";
import { fetchProductDiscounts } from "@/lib/supabase-offers";

export default async function Page() {
  const [promotions, products, discounts] = await Promise.all([
    fetchPromotions(),
    fetchProducts(),
    fetchProductDiscounts(),
  ]);

  return <PromotionsTabs discounts={discounts} promotions={promotions} products={products} />;
}
