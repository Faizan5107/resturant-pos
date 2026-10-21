import { createClient } from "@/lib/supabase/server";
import CreateCategoryModal from "./CreateCategoryModal";
import CreateProductModal from "./CreateProductModal";
import SeedMenuButton from "./SeedMenuButton";
import ProductsTable from "./ProductsTable";

export default async function AdminProductsPage() {
  const supabase = await createClient();

  const [
    { data: categories, error: categoriesError },
    { data: products, error: productsError },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, sort_order, is_active")
      .order("sort_order", { ascending: true })
      .limit(500),
    supabase
      .from("products")
      .select(`
        id,
        code,
        name,
        description,
        image_url,
        category_id,
        kitchen_station,
        tax_applicable,
        status,
        sort_order,
        categories(name),
        product_variants(
          id,
          name,
          sale_price,
          variant_costs(cost_price)
        )
      `)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true })
      .limit(1000),
  ]);
  if (categoriesError) throw categoriesError;
  if (productsError) throw productsError;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight">
            Products & Menu
          </h1>
          <p className="text-xs text-zinc-500">
            Manage menu categories, products, variants, and cost prices.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <SeedMenuButton />
          <CreateCategoryModal />
          <CreateProductModal categories={categories || []} />
        </div>
      </div>

      <ProductsTable categories={categories || []} products={(products as any) || []} />
    </div>
  );
}
