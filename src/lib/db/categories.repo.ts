import type { Category } from "@/types";
import { dataApi } from "./data-api";

export async function listCategories(): Promise<Category[]> {
    const query = new URLSearchParams({
        select: "slug,name,description,imageUrl",
        order: "name.asc",
    });
    const rows = await dataApi<Category[]>("Category", {
        access: "anonymous",
        query,
    });
    return rows.map((row) => ({
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description),
        imageUrl: String(row.imageUrl),
    }));
}

export async function getCategory(slug: string): Promise<Category | null> {
    const query = new URLSearchParams({
        select: "slug,name,description,imageUrl",
        slug: "eq." + JSON.stringify(slug),
        limit: "1",
    });
    const rows = await dataApi<Category[]>("Category", {
        access: "anonymous",
        query,
    });
    const row = rows[0];
    return row
        ? {
              slug: String(row.slug),
              name: String(row.name),
              description: String(row.description),
              imageUrl: String(row.imageUrl),
          }
        : null;
}

/** @deprecated Catalogue writes run through the owner-only seed script. */
export async function putCategory(_category: Category): Promise<void> {
    throw new Error("Catalogue writes require the owner-only seed script");
}
