/**
 * Loads sample categories and products. Run: pnpm run db:seed
 * Uses PutItem (upsert), so re-running refreshes the catalogue without duplicates.
 * Images use picsum.photos with a per-product seed so each product gets a stable picture.
 */
import { putCategory } from "../src/lib/db/categories.repo";
import { putProduct } from "../src/lib/db/products.repo";
import { slugify } from "../src/lib/utils";
import type { Category, Product } from "../src/types";

const img = (seed: string, size = 800) =>
    `https://picsum.photos/seed/${seed}/${size}/${size}`;

const categories: Category[] = [
    {
        slug: "home",
        name: "Home",
        description: "Textiles and decor.",
        imageUrl: img("home", 600),
    },
    {
        slug: "kitchen",
        name: "Kitchen",
        description: "Cook and serve.",
        imageUrl: img("kitchen", 600),
    },
    {
        slug: "desk",
        name: "Desk",
        description: "Tools for focus.",
        imageUrl: img("desk", 600),
    },
    {
        slug: "outdoors",
        name: "Outdoors",
        description: "Carry and explore.",
        imageUrl: img("outdoors", 600),
    },
];

// [name, categorySlug, priceCents, stock, featured]
const rows: [string, string, number, number, boolean][] = [
    ["Linen Throw Blanket", "home", 8900, 24, true],
    ["Stoneware Vase", "home", 4200, 12, false],
    ["Wool Floor Cushion", "home", 6400, 3, false],
    ["Cast Iron Skillet", "kitchen", 5500, 40, true],
    ["Walnut Serving Board", "kitchen", 3800, 0, false],
    ["Enamel Kettle", "kitchen", 4900, 18, true],
    ["Oak Desk Organiser", "desk", 3400, 30, false],
    ["Brass Desk Lamp", "desk", 9800, 9, true],
    ["Hardcover Notebook Set", "desk", 2200, 100, false],
    ["Waxed Canvas Daypack", "outdoors", 12900, 15, true],
    ["Insulated Steel Bottle", "outdoors", 3200, 60, false],
    ["Packable Rain Jacket", "outdoors", 14500, 7, false],
];

async function main(): Promise<void> {
    await Promise.all(categories.map(putCategory));
    const base = Date.now();
    // Stagger createdAt so date ordering is deterministic.
    const products: Product[] = rows.map(
        ([name, categorySlug, priceCents, stock, featured], i) => {
            const id = slugify(name);
            return {
                id,
                name,
                categorySlug,
                priceCents,
                stock,
                featured,
                description: `${name} - made to be used every day. Durable materials, simple design, built to last.`,
                currency: "USD",
                images: [img(id), img(`${id}-2`)],
                tags: [categorySlug, ...name.toLowerCase().split(" ")],
                createdAt: new Date(base - i * 60_000).toISOString(),
            };
        },
    );
    await Promise.all(products.map(putProduct));
    console.log(
        `Seeded ${categories.length} categories and ${products.length} products.`,
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
