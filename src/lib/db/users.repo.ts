import { ConflictError } from "@/lib/errors";
import type { UserRecord } from "@/types";
import { Prisma } from "@prisma/client";
import { db } from "./client";

function toRecord(user: { id: string; email: string; name: string; passwordHash: string; createdAt: Date }): UserRecord {
    return { ...user, createdAt: user.createdAt.toISOString() };
}

/** Creates an account; the unique email constraint is enforced by PostgreSQL. */
export async function createUser(user: UserRecord): Promise<void> {
    try {
        await db.user.create({ data: { ...user, createdAt: new Date(user.createdAt) } });
    } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
            throw new ConflictError("An account with this email already exists");
        throw err;
    }
}

export async function getUserById(id: string): Promise<UserRecord | null> {
    const user = await db.user.findUnique({ where: { id } });
    return user ? toRecord(user) : null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await db.user.findUnique({ where: { email } });
    return user ? toRecord(user) : null;
}
