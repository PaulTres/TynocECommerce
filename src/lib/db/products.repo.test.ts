import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/constants", () => ({ PAGE_SIZE: 20, API_LIMIT: 100 }));

// Replace the network layer with a spy.
vi.mock("./data-api", () => ({ dataApi: vi.fn() }));

import { ValidationError } from "@/lib/errors";
import { API_LIMIT } from "../constants";
import { decodeCursor, encodeCursor } from "../utils";
import { dataApi } from "./data-api";
import {
    batchGetProducts,
    getProduct,
    getRelated,
    queryProducts,
} from "./products.repo";

const dataApiMock = vi.mocked(dataApi);

/** Builds a raw DB row; override any column to test coercion edge cases. */
function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "p1",
        name: "Widget",
        description: "A widget",
        priceCents: 1999,
        currency: "USD",
        categorySlug: "tools",
        images: ["a.png"],
        stock: 5,
        tags: ["hot"],
        featured: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        ...overrides,
    };
}

/** Returns the [table, options] of the nth data API call (default: last). */
function call(n = -1) {
    const calls = dataApiMock.mock.calls;
    const [table, opts] = calls.at(n)!;
    return { table, opts: opts as { access: string; query: URLSearchParams } };
}

const CURSOR_ROW = {
    id: "abc",
    priceCents: 500,
    createdAt: "2024-02-02T00:00:00.000Z",
};

beforeEach(() => {
    dataApiMock.mockReset();
});

describe("getProduct", () => {
    it("queries the Product table anonymously by id with limit 1", async () => {
        dataApiMock.mockResolvedValue([makeRow()]);

        await getProduct("p1");

        const { table, opts } = call();
        expect(table).toBe("Product");
        expect(opts.access).toBe("anonymous");
        expect(opts.query.get("id")).toBe("eq.p1");
        expect(opts.query.get("limit")).toBe("1");
        expect(opts.query.get("select")).toContain("priceCents");
    });

    it("maps the row to a Product", async () => {
        dataApiMock.mockResolvedValue([makeRow()]);
        await expect(getProduct("p1")).resolves.toEqual({
            id: "p1",
            name: "Widget",
            description: "A widget",
            priceCents: 1999,
            currency: "USD",
            categorySlug: "tools",
            images: ["a.png"],
            stock: 5,
            tags: ["hot"],
            featured: true,
            createdAt: "2024-01-01T00:00:00.000Z",
        });
    });

    it("returns null when no row is found", async () => {
        dataApiMock.mockResolvedValue([]);
        await expect(getProduct("missing")).resolves.toBeNull();
    });

    it("propagates data API failures", async () => {
        dataApiMock.mockRejectedValue(new Error("boom"));
        await expect(getProduct("p1")).rejects.toThrow("boom");
    });
});

describe("row coercion", () => {
    it("stringifies/numberifies loosely typed columns", async () => {
        dataApiMock.mockResolvedValue([
            makeRow({ id: 7, priceCents: "250", stock: "3", featured: 0 }),
        ]);
        const p = (await getProduct("7"))!;
        expect(p.id).toBe("7");
        expect(p.priceCents).toBe(250);
        expect(p.stock).toBe(3);
        expect(p.featured).toBe(false);
    });

    it("accepts Date objects and date strings for createdAt", async () => {
        dataApiMock.mockResolvedValue([
            makeRow({ createdAt: new Date("2024-05-05T10:00:00Z") }),
        ]);
        expect((await getProduct("p1"))!.createdAt).toBe(
            "2024-05-05T10:00:00.000Z",
        );
    });

    it("falls back to [] when images/tags are not arrays", async () => {
        dataApiMock.mockResolvedValue([makeRow({ images: null, tags: "x" })]);
        const p = (await getProduct("p1"))!;
        expect(p.images).toEqual([]);
        expect(p.tags).toEqual([]);
    });

    it("stringifies non-string array members", async () => {
        dataApiMock.mockResolvedValue([makeRow({ tags: [1, "a"] })]);
        expect((await getProduct("p1"))!.tags).toEqual(["1", "a"]);
    });

    it("receives unknown date for an invalid date", async () => {
        dataApiMock.mockResolvedValue([makeRow({ createdAt: "not-a-date" })]);
        const result = await getProduct("p1");

        expect(result).toEqual({
            categorySlug: "tools",
            createdAt: "unknown",
            currency: "USD",
            description: "A widget",
            featured: true,
            id: "p1",
            images: ["a.png"],
            name: "Widget",
            priceCents: 1999,
            stock: 5,
            tags: ["hot"],
        });
    });
});

describe("batchGetProducts", () => {
    it("does not call the API when receiving an empty list", async () => {
        await expect(batchGetProducts([])).resolves.toEqual([]);
        expect(dataApiMock).not.toHaveBeenCalled();
    });

    it("de-duplicates ids and builds an `in.(...)` filter", async () => {
        dataApiMock.mockResolvedValue([
            makeRow({ id: "a" }),
            makeRow({ id: "b" }),
        ]);

        const result = await batchGetProducts(["a", "b", "a"]);

        expect(call().opts.query.get("id")).toBe("in.(a,b)");
        expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    });
});

describe("queryProducts - defaults and limits", () => {
    beforeEach(() => dataApiMock.mockResolvedValue([]));

    it("uses PAGE_SIZE + 1 (look-ahead row) and newest ordering by default", async () => {
        await queryProducts({});

        const { table, opts } = call();
        expect(table).toBe("Product");
        expect(opts.access).toBe("anonymous");
        expect(opts.query.get("limit")).toBe("21");
        expect(opts.query.get("order")).toBe("createdAt.desc,id.desc");
        expect(opts.query.has("or")).toBe(false);
        expect(opts.query.has("and")).toBe(false);
    });

    it("clamps limit to the [1, API_LIMIT] range", async () => {
        await queryProducts({ limit: 0 });
        expect(call().opts.query.get("limit")).toBe("2");

        await queryProducts({ limit: -50 });
        expect(call().opts.query.get("limit")).toBe("2");

        await queryProducts({ limit: 10_000 });
        expect(call().opts.query.get("limit")).toBe(`${API_LIMIT + 1}`);
    });

    it("selects the expected ordering for each sort option", async () => {
        await queryProducts({ sort: "price-asc" });
        expect(call().opts.query.get("order")).toBe("priceCents.asc,id.asc");

        await queryProducts({ sort: "price-desc" });
        expect(call().opts.query.get("order")).toBe("priceCents.desc,id.asc");

        await queryProducts({ sort: "newest" });
        expect(call().opts.query.get("order")).toBe("createdAt.desc,id.desc");
    });
});

describe("queryProducts - filters", () => {
    beforeEach(() => dataApiMock.mockResolvedValue([]));

    it("applies the featured filter when true", async () => {
        await queryProducts({ featured: true });
        expect(call().opts.query.get("featured")).toBe("eq.true");
    });

    it("applies the category filter", async () => {
        await queryProducts({ categorySlug: "tools" });
        expect(call().opts.query.get("categorySlug")).toBe("eq.tools");
    });

    it("applies min and max price as two filters on the same column", async () => {
        await queryProducts({ minPriceCents: 100, maxPriceCents: 500 });
        expect(call().opts.query.getAll("priceCents")).toEqual([
            "gte.100",
            "lte.500",
        ]);
    });

    it("treats a min price of 0 as a real filter", async () => {
        await queryProducts({ minPriceCents: 0 });
        expect(call().opts.query.get("priceCents")).toBe("gte.0");
    });

    it("applies only a max price when min is absent", async () => {
        await queryProducts({ maxPriceCents: 500 });
        expect(call().opts.query.getAll("priceCents")).toEqual(["lte.500"]);
    });
});

describe("queryProducts - search", () => {
    beforeEach(() => dataApiMock.mockResolvedValue([]));

    it("builds a single or() over name, description and tags", async () => {
        await queryProducts({ search: "  Foo " });

        const pattern = JSON.stringify("%Foo%");
        expect(call().opts.query.get("or")).toBe(
            `(name.ilike.${pattern},description.ilike.${pattern},tags.cs.{"foo"})`,
        );
        expect(call().opts.query.has("and")).toBe(false);
    });

    it("lower-cases only the tag term, not the ilike pattern", async () => {
        await queryProducts({ search: "FoO" });
        const or = call().opts.query.get("or")!;
        expect(or).toContain(`ilike.${JSON.stringify("%FoO%")}`);
        expect(or).toContain(`tags.cs.{"foo"}`);
    });

    it("escapes wildcards and backslashes", async () => {
        await queryProducts({ search: "a%b_c\\d" });
        expect(call().opts.query.get("or")).toContain(
            `name.ilike.${JSON.stringify("%a\\%b\\_c\\\\d%")}`,
        );
    });

    it("quotes values so commas/parentheses cannot break the filter", async () => {
        await queryProducts({ search: 'x),id.eq.1,("' });
        const or = call().opts.query.get("or")!;
        expect(or).toContain(JSON.stringify('%x),id.eq.1,(\"%'));
    });

    it("ignores whitespace-only search", async () => {
        await queryProducts({ search: "   " });
        expect(call().opts.query.has("or")).toBe(false);
        expect(call().opts.query.has("and")).toBe(false);
    });
});

describe("queryProducts - cursor validation", () => {
    it("rejects a cursor whose row no longer exists", async () => {
        dataApiMock.mockResolvedValueOnce([]); // cursor lookup

        await expect(
            queryProducts({ nextCursor: encodeCursor("gone") }),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(dataApiMock).toHaveBeenCalledTimes(1);
    });

    it("looks the cursor row up by id before querying", async () => {
        dataApiMock
            .mockResolvedValueOnce([CURSOR_ROW])
            .mockResolvedValueOnce([]);

        await queryProducts({ nextCursor: encodeCursor("abc") });

        expect(dataApiMock).toHaveBeenCalledTimes(2);
        const first = call(0).opts.query;
        expect(first.get("select")).toBe("id,priceCents,createdAt");
        expect(first.get("id")).toBe("eq.abc");
        expect(first.get("limit")).toBe("1");
    });
});

describe("queryProducts - keyset conditions", () => {
    beforeEach(() => {
        dataApiMock
            .mockResolvedValueOnce([CURSOR_ROW])
            .mockResolvedValueOnce([]);
    });

    const cursor = () => encodeCursor("abc");
    const quotedId = JSON.stringify("abc");
    const quotedDate = JSON.stringify(CURSOR_ROW.createdAt);

    it("newest: createdAt < cursor OR (equal AND id < cursor id)", async () => {
        await queryProducts({ nextCursor: cursor(), sort: "newest" });
        expect(call().opts.query.get("or")).toBe(
            `(createdAt.lt.${quotedDate},and(createdAt.eq.${quotedDate},id.lt.${quotedId}))`,
        );
    });

    it("price-asc: price > cursor OR (equal AND id > cursor id)", async () => {
        await queryProducts({ nextCursor: cursor(), sort: "price-asc" });
        expect(call().opts.query.get("or")).toBe(
            `(priceCents.gt.500,and(priceCents.eq.500,id.gt.${quotedId}))`,
        );
    });

    it("price-desc: price < cursor OR (equal AND id > cursor id)", async () => {
        await queryProducts({ nextCursor: cursor(), sort: "price-desc" });
        expect(call().opts.query.get("or")).toBe(
            `(priceCents.lt.500,and(priceCents.eq.500,id.gt.${quotedId}))`,
        );
        expect(call().opts.query.get("order")).toBe("priceCents.desc,id.asc");
    });

    it("combines search + cursor into a single and(or(...),or(...))", async () => {
        await queryProducts({
            nextCursor: cursor(),
            sort: "price-asc",
            search: "foo",
        });

        const q = call().opts.query;
        expect(q.has("or")).toBe(false);
        const and = q.get("and")!;
        expect(and.startsWith("(or(name.ilike.")).toBe(true);
        expect(and).toContain(",or(priceCents.gt.500,");
        expect(and.endsWith("))")).toBe(true);
    });
});

describe("queryProducts - result paging", () => {
    it("returns nextCursor (last item id) when a look-ahead row exists", async () => {
        dataApiMock.mockResolvedValue([
            makeRow({ id: "a" }),
            makeRow({ id: "b" }),
            makeRow({ id: "c" }), // look-ahead row, must be dropped
        ]);

        const page = await queryProducts({ limit: 2 });

        expect(page.items.map((p) => p.id)).toEqual(["a", "b"]);
        expect(page.nextCursor).not.toBeNull();
        expect(decodeCursor(page.nextCursor!)).toBe("b");
    });

    it("returns a null cursor on the last page", async () => {
        dataApiMock.mockResolvedValue([
            makeRow({ id: "a" }),
            makeRow({ id: "b" }),
        ]);

        const page = await queryProducts({ limit: 2 });

        expect(page.items).toHaveLength(2);
        expect(page.nextCursor).toBeUndefined();
    });

    it("returns an empty page with a null cursor when nothing matches", async () => {
        dataApiMock.mockResolvedValue([]);
        await expect(queryProducts({})).resolves.toEqual({
            items: [],
            nextCursor: undefined,
        });
    });

    it("round-trips: the returned cursor is accepted by the next call", async () => {
        dataApiMock.mockResolvedValueOnce([
            makeRow({ id: "a" }),
            makeRow({ id: "b" }),
        ]);
        const first = await queryProducts({ limit: 1 });

        dataApiMock
            .mockResolvedValueOnce([{ ...CURSOR_ROW, id: "a" }]) // cursor lookup
            .mockResolvedValueOnce([]); // page query
        await expect(
            queryProducts({ limit: 1, nextCursor: first.nextCursor! }),
        ).resolves.toEqual({ items: [], nextCursor: undefined });
        expect(call(1).opts.query.get("id")).toBe("eq.a");
    });

    it("propagates data API errors from the main query", async () => {
        dataApiMock.mockRejectedValue(new Error("db down"));
        await expect(queryProducts({})).rejects.toThrow("db down");
    });
});

describe("getRelated", () => {
    const base = {
        id: "p1",
        categorySlug: "tools",
    } as Parameters<typeof getRelated>[0];

    beforeEach(() => dataApiMock.mockResolvedValue([makeRow({ id: "p2" })]));

    it("fetches same-category products excluding the source, newest first", async () => {
        const result = await getRelated(base);

        const q = call().opts.query;
        expect(q.get("categorySlug")).toBe("eq.tools");
        expect(q.get("id")).toBe("neq.p1");
        expect(q.get("order")).toBe("createdAt.desc,id.desc");
        expect(q.get("limit")).toBe("4");
        expect(result.map((p) => p.id)).toEqual(["p2"]);
    });

    it.each([[2.7], [0], [-3], [NaN]])("throws for limit %s", async (input) => {
        await expect(getRelated(base, input)).rejects.toThrow(ValidationError);
    });
});
