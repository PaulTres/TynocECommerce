import { ConflictError, NotFoundError } from "@/lib/errors";
import type { CartItemRecord } from "@/types";
import { Prisma } from "@prisma/client";
import { db } from "./client";

export async function listCartItems(userId: string): Promise<CartItemRecord[]> {
    const rows = await db.cartItem.findMany({ where: { userId }, orderBy: { addedAt: "asc" } });
    return rows.map(({ productId, quantity, addedAt, updatedAt }) => ({ productId, quantity, addedAt: addedAt.toISOString(), updatedAt: updatedAt.toISOString() }));
}

export async function incrementItem(userId: string, productId: string, qty: number, cap: number): Promise<number> {
    if (qty > cap) throw new ConflictError(`You can add at most ${cap} of this item`);
    for (let attempt = 0; attempt < 3; attempt++) {
        const row = await db.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
        if (!row) {
            try {
                await db.cartItem.create({ data: { userId, productId, quantity: qty } });
                return qty;
            } catch (err) {
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
                throw err;
            }
        }
        const result = await db.cartItem.updateMany({
            where: { userId, productId, quantity: { lte: cap - qty } },
            data: { quantity: { increment: qty } },
        });
        if (result.count) {
            const updated = await db.cartItem.findUnique({ where: { userId_productId: { userId, productId } }, select: { quantity: true } });
            return updated?.quantity ?? row.quantity + qty;
        }
        const current = await db.cartItem.findUnique({ where: { userId_productId: { userId, productId } } });
        if (!current) continue;
        throw new ConflictError(`You can have at most ${cap} of this item in your cart`);
    }
    throw new ConflictError("Your cart changed while this item was being added. Please try again.");
}

export async function setQuantity(userId: string, productId: string, quantity: number): Promise<void> {
    const result = await db.cartItem.updateMany({ where: { userId, productId }, data: { quantity } });
    if (result.count === 0) throw new NotFoundError("That item is not in your cart");
}

export async function removeItem(userId: string, productId: string): Promise<void> {
    await db.cartItem.deleteMany({ where: { userId, productId } });
}
