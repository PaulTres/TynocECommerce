import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./data-api", () => ({
    dataApi: vi.fn(),
}));

import { getCategory, listCategories } from "./categories.repo";
import { dataApi } from "./data-api";

const dataApiMock = vi.mocked(dataApi);

/**
 * Factory for a raw database row. Overrides let each test change only the
 * field it cares about.
 */
function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        slug: "electronics",
        name: "Electronics",
        description: "Gadgets and devices",
        imageUrl: "https://cdn.example.com/electronics.png",
        ...overrides,
    };
}

/**
 * Helper which extracts the options object (2nd argument) passed to the most recent
 * `dataApi` call and returns its URLSearchParams.
 */
function lastQuery(): URLSearchParams {
    const options = dataApiMock.mock.calls.at(-1)![1] as {
        access: string;
        query: URLSearchParams;
    };
    return options.query;
}

// Reset call history and queued return values so tests cannot leak state.
beforeEach(() => {
    dataApiMock.mockReset();
});

describe("listCategories", () => {
    it("requests the Category table anonymously", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await listCategories();

        expect(dataApiMock).toHaveBeenCalledTimes(1);
        expect(dataApiMock).toHaveBeenCalledWith(
            "Category",
            expect.objectContaining({ access: "anonymous" }),
        );
    });

    it("selects only the public columns and sorts by name ascending", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await listCategories();

        const query = lastQuery();
        expect(query.get("select")).toBe("slug,name,description,imageUrl");
        expect(query.get("order")).toBe("name.asc");
        expect(query.has("limit")).toBe(false);
        expect(query.has("slug")).toBe(false);
    });

    it("maps every row to a Category, preserving order", async () => {
        dataApiMock.mockResolvedValueOnce([
            makeRow({ slug: "books", name: "Books" }),
            makeRow({ slug: "toys", name: "Toys" }),
        ]);

        const result = await listCategories();

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.slug)).toEqual(["books", "toys"]);
        expect(result[0]).toEqual({
            slug: "books",
            name: "Books",
            description: "Gadgets and devices",
            imageUrl: "https://cdn.example.com/electronics.png",
        });
    });

    it("returns an empty array when there are no categories", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await expect(listCategories()).resolves.toEqual([]);
    });

    it("coerces non-string values to strings", async () => {
        dataApiMock.mockResolvedValueOnce([makeRow({ slug: 123, name: true })]);

        const [category] = await listCategories();

        expect(category.slug).toBe("123");
        expect(category.name).toBe("true");
    });

    it("propagates errors from the data layer", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("network down"));

        await expect(listCategories()).rejects.toThrow("network down");
    });
});

describe("getCategory", () => {
    it("requests the Category table anonymously", async () => {
        dataApiMock.mockResolvedValueOnce([makeRow()]);

        await getCategory("electronics");

        expect(dataApiMock).toHaveBeenCalledWith(
            "Category",
            expect.objectContaining({ access: "anonymous" }),
        );
    });

    it("filters by slug with an eq operator and limits to one row", async () => {
        dataApiMock.mockResolvedValueOnce([makeRow()]);

        await getCategory("electronics");

        const query = lastQuery();
        expect(query.get("select")).toBe("slug,name,description,imageUrl");
        expect(query.get("slug")).toBe("eq.electronics");
        expect(query.get("limit")).toBe("1");
    });

    it("returns the mapped category when found", async () => {
        dataApiMock.mockResolvedValueOnce([makeRow()]);

        await expect(getCategory("electronics")).resolves.toEqual({
            slug: "electronics",
            name: "Electronics",
            description: "Gadgets and devices",
            imageUrl: "https://cdn.example.com/electronics.png",
        });
    });

    it("returns null when no row matches", async () => {
        dataApiMock.mockResolvedValueOnce([]);

        await expect(getCategory("does-not-exist")).resolves.toBeNull();
    });

    it("uses only the first row if the API unexpectedly returns several", async () => {
        dataApiMock.mockResolvedValueOnce([
            makeRow({ slug: "first" }),
            makeRow({ slug: "second" }),
        ]);

        const result = await getCategory("first");

        expect(result?.slug).toBe("first");
    });

    it("keeps a malicious slug inside the single slug parameter (no param injection)", async () => {
        dataApiMock.mockResolvedValueOnce([]);
        const malicious = "x&limit=1000&select=*";

        await getCategory(malicious);

        const query = lastQuery();
        expect(query.get("slug")).toBe(`eq.${malicious}`);
        expect(query.get("limit")).toBe("1"); // not overridden
        expect(query.get("select")).toBe("slug,name,description,imageUrl");
        expect(query.toString()).toContain(
            "slug=eq.x%26limit%3D1000%26select%3D*",
        );
    });

    it("propagates errors from the data layer", async () => {
        dataApiMock.mockRejectedValueOnce(new Error("boom"));

        await expect(getCategory("electronics")).rejects.toThrow("boom");
    });
});
