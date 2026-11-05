import type { Category } from "@/types";
import { dataApi } from "./data-api";

/**Used to map database responses to the row type directly; guards against data leakage.*/
function toCategory(row: Category): Category {
    return {
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description ?? ""),
        imageUrl: String(row.imageUrl),
    };
}

/**Lists all categories. */
export async function listCategories(): Promise<Category[]> {
    const query = new URLSearchParams({
        select: "slug,name,description,imageUrl",
        order: "name.asc",
    });
    const rows = await dataApi<Category[]>("Category", {
        access: "anonymous",
        query,
    });
    return rows.map(toCategory);
}

/**Gets a specific category identified by a slug, with anonymous query access. */
export async function getCategory(slug: string): Promise<Category | null> {
    const query = new URLSearchParams({
        select: "slug,name,description,imageUrl",
        slug: `eq.${slug}`,
        limit: "1",
    });
    const rows = await dataApi<Category[]>("Category", {
        access: "anonymous",
        query,
    });
    const row = rows[0];
    return row ? toCategory(row) : null;
}
