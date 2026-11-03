/**
 * Loads sample categories and products. Run: pnpm run db:seed
 * Uses Prisma upserts, so re-running refreshes the catalogue without duplicates.
 * Images use picsum.photos with a per-product seed so each product gets a stable picture.
 */
import { PrismaClient } from "@prisma/client";
import type { Category, Product } from "../src/types";

function slugify(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

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

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL is required for database seeding");
const db = new PrismaClient({ datasources: { db: { url: directUrl } } });

async function main(): Promise<void> {
    await Promise.all(
        categories.map((category) =>
            db.category.upsert({
                where: { slug: category.slug },
                create: category,
                update: category,
            }),
        ),
    );
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
    await Promise.all(
        products.map((product) => {
            const data = { ...product, createdAt: new Date(product.createdAt) };
            return db.product.upsert({
                where: { id: product.id },
                create: data,
                update: data,
            });
        }),
    );
    console.log(
        `Seeded ${categories.length} categories and ${products.length} products.`,
    );
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
