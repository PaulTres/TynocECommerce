import { withErrors, type RouteContext } from "@/lib/api/handler";
import { requireUserId } from "@/lib/api/session";
import { productIdSchema } from "@/lib/validation/schemas";
import * as wishlistService from "@/services/wishlist.service";
import { NextResponse } from "next/server";

/** DELETE /api/wishlist/:productId -> 204. */
export const DELETE = withErrors(
    async (_req: Request, ctx: RouteContext<{ productId: string }>) => {
        const userId = await requireUserId();
        const { productId } = await ctx.params;
        await wishlistService.removeFromWishlist(
            userId,
            productIdSchema.parse(productId),
        );
        return new NextResponse(null, { status: 204 });
    },
);
