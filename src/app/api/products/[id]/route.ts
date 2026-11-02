import { NextResponse } from "next/server";
import { withErrors, type RouteContext } from "@/lib/api/handler";
import { productIdSchema } from "@/lib/validation/schemas";
import { getProductDetail } from "@/services/product.service";

/** GET /api/products/:id -> { product, category, related } or 404. */
export const GET = withErrors(async (_req: Request, ctx: RouteContext<{ id: string }>) => {
  const { id } = await ctx.params;
  return NextResponse.json(await getProductDetail(productIdSchema.parse(id)));
});
