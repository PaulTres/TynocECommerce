import type { Category } from "@/types";
import { db } from "./client";

export async function listCategories(): Promise<Category[]> {
    return db.category.findMany({ orderBy: { name: "asc" } });
}

export async function getCategory(slug: string): Promise<Category | null> {
    return db.category.findUnique({ where: { slug } });
}

export async function putCategory(category: Category): Promise<void> {
    await db.category.upsert({ where: { slug: category.slug }, create: category, update: category });
}
