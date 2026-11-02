import { NextResponse } from "next/server";
import { readJson, withErrors } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import { addToCartSchema } from "@/lib/validation/schemas";
import * as cartService from "@/services/cart.service";

/** GET /api/cart -> the signed-in user's cart with subtotal. 401 when signed out. */
export const GET = withErrors(async () => {
  const userId = await requireUserId();
  return NextResponse.json(await cartService.getCart(userId), { headers: { "Cache-Control": "private, no-store" } });
});

/** POST /api/cart { productId, quantity? } -> adds to the cart, responds with the updated cart. */
export const POST = withErrors(async (req: Request) => {
  const userId = await requireUserId();
  const { productId, quantity } = addToCartSchema.parse(await readJson(req));
  await cartService.addToCart(userId, productId, quantity);
  return NextResponse.json(await cartService.getCart(userId), { status: 201 });
});
