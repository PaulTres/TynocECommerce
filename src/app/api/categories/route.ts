import { NextResponse } from "next/server";
import { withErrors } from "@/lib/api/handler";
import { getCategories } from "@/services/product.service";

/** GET /api/categories -> { items: Category[] } (public, cacheable). */
export const GET = withErrors(async () => {
  const items = await getCategories();
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=300" } });
});
