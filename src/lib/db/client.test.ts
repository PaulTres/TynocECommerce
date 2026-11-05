import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spy that records every `new PrismaClient(options)` call made by client.ts.
const prismaCtorSpy = vi.fn();

/**
 * Fake PrismaClient. Using a real class (instead of `vi.fn()` as a constructor)
 * keeps `new` semantics identical across Vitest versions, and storing the
 * options on the instance lets tests assert on exactly what was passed in.
 */
class FakePrismaClient {
    public readonly options: unknown;

    constructor(options: unknown) {
        this.options = options;
        prismaCtorSpy(options);
    }
}

type MutableEnv = Record<string, string | undefined>;
type GlobalWithPrisma = { prisma?: unknown };

const env = (): MutableEnv => process.env as MutableEnv;
const g = (): GlobalWithPrisma => globalThis as unknown as GlobalWithPrisma;

const ORIGINAL_ENV = { ...process.env };
const TEST_URL = "postgresql://owner:secret@localhost:5432/app";

/**
 * Sets (or deletes, when `undefined`) an environment variable.
 */
function setEnv(key: string, value: string | undefined): void {
    if (value === undefined) delete env()[key];
    else env()[key] = value;
}

/**
 * Imports a *fresh* copy of client.ts so its top-level side effects run again
 * under the environment/global state configured by the current test.
 */
async function loadClient() {
    return import("./client");
}

describe("prisma client (client.ts)", () => {
    beforeEach(() => {
        vi.resetModules();
        prismaCtorSpy.mockClear();

        vi.doMock("@prisma/client", () => ({ PrismaClient: FakePrismaClient }));

        // Isolate env and global state.
        process.env = { ...ORIGINAL_ENV };
        setEnv("DIRECT_URL", TEST_URL);
        setEnv("NODE_ENV", "test");
        delete g().prisma;
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
        delete g().prisma;
        vi.doUnmock("@prisma/client");
    });

    describe("DIRECT_URL validation", () => {
        it("throws a descriptive error when DIRECT_URL is not set", async () => {
            setEnv("DIRECT_URL", undefined);

            await expect(loadClient()).rejects.toThrow(
                "DIRECT_URL is required for the owner-only Prisma client",
            );
        });

        it("throws when DIRECT_URL is an empty string (false value)", async () => {
            setEnv("DIRECT_URL", "");

            await expect(loadClient()).rejects.toThrow(
                /DIRECT_URL is required/,
            );
        });

        it("does not construct a PrismaClient when validation fails", async () => {
            setEnv("DIRECT_URL", undefined);

            await expect(loadClient()).rejects.toThrow();
            expect(prismaCtorSpy).not.toHaveBeenCalled();
        });

        it("does not populate the global cache when validation fails", async () => {
            setEnv("DIRECT_URL", undefined);

            await expect(loadClient()).rejects.toThrow();
            expect(g().prisma).toBeUndefined();
        });
    });

    describe("PrismaClient construction", () => {
        it("exports a PrismaClient instance as `db`", async () => {
            const { db } = await loadClient();

            expect(db).toBeInstanceOf(FakePrismaClient);
        });

        it("constructs exactly one client", async () => {
            await loadClient();

            expect(prismaCtorSpy).toHaveBeenCalledTimes(1);
        });

        it("passes DIRECT_URL as the datasource url", async () => {
            await loadClient();

            expect(prismaCtorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    datasources: { db: { url: TEST_URL } },
                }),
            );
        });

        it("uses the DIRECT_URL value that is present at import time", async () => {
            const otherUrl = "postgresql://other:pw@db.example.com/other";
            setEnv("DIRECT_URL", otherUrl);

            await loadClient();

            expect(prismaCtorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    datasources: { db: { url: otherUrl } },
                }),
            );
        });
    });

    describe("logging configuration", () => {
        it("logs warnings and errors in development", async () => {
            setEnv("NODE_ENV", "development");

            await loadClient();

            expect(prismaCtorSpy).toHaveBeenCalledWith(
                expect.objectContaining({ log: ["warn", "error"] }),
            );
        });

        it.each(["production", "test", undefined])(
            "logs only errors when NODE_ENV is %s",
            async (nodeEnv) => {
                setEnv("NODE_ENV", nodeEnv);

                await loadClient();

                expect(prismaCtorSpy).toHaveBeenCalledWith(
                    expect.objectContaining({ log: ["error"] }),
                );
            },
        );
    });

    describe("global singleton caching (hot-reload protection)", () => {
        it.each(["development", "test", undefined])(
            "stores the client on globalThis when NODE_ENV is %s",
            async (nodeEnv) => {
                setEnv("NODE_ENV", nodeEnv);

                const { db } = await loadClient();

                expect(g().prisma).toBe(db);
            },
        );

        it("does not store the client on globalThis in production", async () => {
            setEnv("NODE_ENV", "production");

            await loadClient();

            expect(g().prisma).toBeUndefined();
        });

        it("reuses the cached client instead of creating a new one", async () => {
            const cached = new FakePrismaClient({ cached: true });
            prismaCtorSpy.mockClear(); // ignore the construction above
            g().prisma = cached;

            const { db } = await loadClient();

            expect(db).toBe(cached);
            expect(prismaCtorSpy).not.toHaveBeenCalled();
        });

        it("reuses an existing global client", async () => {
            setEnv("NODE_ENV", "production");
            const cached = new FakePrismaClient({ cached: true });
            prismaCtorSpy.mockClear();
            g().prisma = cached;

            const { db } = await loadClient();

            expect(db).toBe(cached);
            expect(prismaCtorSpy).not.toHaveBeenCalled();
        });

        it("returns the same instance across repeated module reloads", async () => {
            const first = (await loadClient()).db;

            vi.resetModules();
            vi.doMock("@prisma/client", () => ({
                PrismaClient: FakePrismaClient,
            }));
            const second = (await loadClient()).db;

            expect(second).toBe(first);
            expect(prismaCtorSpy).toHaveBeenCalledTimes(1);
        });
    });
});
