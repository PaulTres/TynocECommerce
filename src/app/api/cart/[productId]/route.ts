import { NextResponse } from "next/server";
import { readJson, withErrors, type RouteContext } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import { productIdSchema, updateCartSchema } from "@/lib/validation/schemas";
import * as cartService from "@/services/cart.service";

type Ctx = RouteContext<{ productId: string }>;

/** PATCH /api/cart/:productId { quantity } -> sets the quantity (0 removes the line). */
export const PATCH = withErrors(async (req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { productId } = await ctx.params;
  const body = (await readJson(req)) as Record<string, unknown>;
  const input = updateCartSchema.parse({ ...body, productId });
  await cartService.updateQuantity(userId, input.productId, input.quantity);
  return NextResponse.json(await cartService.getCart(userId));
});

/** DELETE /api/cart/:productId -> removes the line. */
export const DELETE = withErrors(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { productId } = await ctx.params;
  await cartService.removeFromCart(userId, productIdSchema.parse(productId));
  return NextResponse.json(await cartService.getCart(userId));
});
