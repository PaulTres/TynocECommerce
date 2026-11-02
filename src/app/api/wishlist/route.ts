import { NextResponse } from "next/server";
import { readJson, withErrors } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import { wishlistSchema } from "@/lib/validation/schemas";
import * as wishlistService from "@/services/wishlist.service";

/** GET /api/wishlist -> { items: Product[] }. */
export const GET = withErrors(async () => {
  const userId = await requireUserId();
  return NextResponse.json({ items: await wishlistService.getWishlist(userId) }, { headers: { "Cache-Control": "private, no-store" } });
});

/** POST /api/wishlist { productId } -> 201 when added, 200 when it was already there. */
export const POST = withErrors(async (req: Request) => {
  const userId = await requireUserId();
  const { productId } = wishlistSchema.parse(await readJson(req));
  const created = await wishlistService.addToWishlist(userId, productId);
  return NextResponse.json({ productId, created }, { status: created ? 201 : 200 });
});
