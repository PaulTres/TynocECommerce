import type { Category } from "@/types";

interface Props {
    categories: Category[];
    values: {
        q?: string;
        category?: string;
        min?: number | string;
        max?: number | string;
        sort?: string;
    };
    validationErrors?: string[];
}

/**
 * Search/filter panel as a plain GET <form>.
 */
export function ProductFilters({
    categories,
    values,
    validationErrors = [],
}: Props) {
    return (
        <form
            action="/products"
            className="grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5"
            role="search"
        >
            <label className="block text-sm lg:col-span-2">
                <span className="mb-1 block font-medium">Search</span>
                <input
                    name="q"
                    defaultValue={values.q}
                    placeholder="e.g. blanket"
                    className="field"
                />
            </label>
            <label className="block text-sm">
                <span className="mb-1 block font-medium">Category</span>
                <select
                    name="category"
                    defaultValue={values.category ?? ""}
                    className="field"
                >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="block">
                    <span className="mb-1 block font-medium">Min $</span>
                    <input
                        name="min"
                        type="number"
                        min={0}
                        defaultValue={values.min}
                        className="field"
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block font-medium">Max $</span>
                    <input
                        name="max"
                        type="number"
                        min={0}
                        defaultValue={values.max}
                        className="field"
                    />
                </label>
            </div>
            <label className="block text-sm">
                <span className="mb-1 block font-medium">Sort</span>
                <select
                    name="sort"
                    defaultValue={values.sort ?? "newest"}
                    className="field"
                >
                    <option value="newest">Newest</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                </select>
            </label>
            {validationErrors.length > 0 && (
                <div
                    className="text-sm text-destructive sm:col-span-2 lg:col-span-5"
                    role="alert"
                >
                    {validationErrors.map((error) => (
                        <p key={error}>{error}</p>
                    ))}
                </div>
            )}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
                <button className="btn-primary">Apply filters</button>
                {/*Calls the site with no parameters to get a clear page. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/products" className="btn-secondary">
                    Clear
                </a>
            </div>
        </form>
    );
}
