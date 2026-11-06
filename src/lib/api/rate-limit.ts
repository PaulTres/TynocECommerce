import { HeadersCarrier, Limiter, Limiters, RateLimitResult } from "@/types";
import {
    MultiRegionRatelimit,
    Ratelimit,
    type Duration,
} from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { after } from "next/server";
import "server-only"; // build fails if this file is ever imported into browser code
import {
    GLOBAL_LIMIT,
    GLOBAL_WINDOW,
    IDENTIFIER_LIMIT,
    IDENTIFIER_WINDOW,
    MAX_SLUG_KEY_LENGTH,
    PER_FORM_LIMIT,
    PER_FORM_WINDOW,
    REDIS_TIMEOUT_MS,
} from "../constants";
import { getClientIp } from "../server-utils";
import { hashKey } from "../utils";

// This module implements Redis-backed rate limiting (Upstash, sliding window).
// Three independent buckets protect login/register:
//global - per client IP, across all forms (slows down scanners)
//perForm - per client IP, per form (slows down brute force from one source)
//identifier - per submitted identifier (e.g. email), regardless of IP(slows down distributed attacks against one account)

// Cached across requests within one server instance (module scope).
// undefined = not built yet, null = built but Redis is not configured.
let cached: Limiters | null | undefined;
let warnedMissingConfig = false;

/**
 * Reads the Redis connection(s) from the environment.
 *
 * Multi-region: comma-separated lists, same order in both, e.g.
 *   UPSTASH_REDIS_REST_URLS=https://eu-xxx.upstash.io,https://us-yyy.upstash.io
 *   UPSTASH_REDIS_REST_TOKENS=tokenEU,tokenUS
 * Single region (UPSTASH_REDIS_REST_URL / _TOKEN) keeps working unchanged.
 * Returns [] when nothing (or a mismatched pair of lists) is configured.
 */
function parseRedisInstances(): Redis[] {
    const split = (v?: string) =>
        (v ?? "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

    const urls = split(
        process.env.UPSTASH_REDIS_REST_URLS ??
            process.env.UPSTASH_REDIS_REST_URL,
    );
    const tokens = split(
        process.env.UPSTASH_REDIS_REST_TOKENS ??
            process.env.UPSTASH_REDIS_REST_TOKEN,
    );

    // A mismatch means a misconfiguration; we refuse to guess which token belongs to which URL.
    if (urls.length !== tokens.length) {
        console.error(
            "[rate-limit] Number of Redis URLs and tokens differ - rate limiting disabled.",
        );
        return [];
    }
    return urls.map((url, i) => new Redis({ url, token: tokens[i] }));
}

/**
 * Builds the limiters once and reuses them.
 * Returns null when Redis env vars are missing.
 */
function getLimiters(): Limiters | null {
    if (cached !== undefined) return cached;

    const redis = parseRedisInstances();
    if (redis.length === 0) {
        // Warn only once so logs are not flooded on every request.
        if (!warnedMissingConfig) {
            warnedMissingConfig = true;
            const msg =
                "[rate-limit] UPSTASH_REDIS_REST_URL(S) / UPSTASH_REDIS_REST_TOKEN(S) not set - rate limiting is DISABLED.";
            if (process.env.NODE_ENV === "production") console.error(msg);
            else console.warn(msg);
        }
        cached = null;
        return cached;
    }

    const build = (
        prefix: string,
        tokens: number,
        window: Duration,
    ): Limiter =>
        redis.length === 1
            ? new Ratelimit({
                  redis: redis[0],
                  limiter: Ratelimit.slidingWindow(tokens, window),
                  prefix,
                  timeout: REDIS_TIMEOUT_MS,
              })
            : new MultiRegionRatelimit({
                  redis,
                  limiter: MultiRegionRatelimit.slidingWindow(tokens, window),
                  prefix,
                  timeout: REDIS_TIMEOUT_MS,
              });

    cached = {
        global: build(
            "ecommerce:rl:submit:global",
            GLOBAL_LIMIT,
            GLOBAL_WINDOW,
        ),
        perForm: build(
            "ecommerce:rl:submit:form",
            PER_FORM_LIMIT,
            PER_FORM_WINDOW,
        ),
        identifier: build(
            "ecommerce:rl:submit:identifier",
            IDENTIFIER_LIMIT,
            IDENTIFIER_WINDOW,
        ),
    };
    return cached;
}

/**
 * Consumes one token from a limiter and converts the answer to a RateLimitResult.
 * Also registers the limiter's `pending` background sync (multi-region) so it
 * finishes even if the serverless function is frozen after the response.
 */
async function consume(
    limiter: Limiter,
    key: string,
): Promise<RateLimitResult> {
    const res = await limiter.limit(key);
    keepAlive(res.pending);
    return res.success ? { allowed: true } : deny(res);
}

/**
 * IP-based check: global bucket first, then the per-form bucket.
 * Used for login and register (slug = "login" | "register").
 * If Redis is down or unconfigured the request is allowed.
 */
export async function checkSubmitRateLimit(
    request: HeadersCarrier,
    slug: string,
): Promise<RateLimitResult> {
    const limiters = getLimiters();
    if (!limiters) return { allowed: true };

    try {
        const client = hashKey(getClientIp(request.headers));

        const global = await consume(limiters.global, `ip:${client}`);
        if (!global.allowed) return global;

        return await consume(
            limiters.perForm,
            `${slug.slice(0, MAX_SLUG_KEY_LENGTH)}:${client}`,
        );
    } catch (err) {
        console.error(
            "[rate-limit] Redis check failed - allowing request",
            err,
        );
        return { allowed: true };
    }
}

/**
 * Per-identifier check (e.g. the email being logged into), independent of IP.
 * This stops a botnet that rotates IPs from guessing passwords for one account.
 */
export async function checkIdentifierRateLimit(
    slug: string,
    identifier: string,
): Promise<RateLimitResult> {
    const limiters = getLimiters();
    if (!limiters) return { allowed: true };

    try {
        const id = hashKey(identifier.trim().toLowerCase());
        return await consume(
            limiters.identifier,
            `${slug.slice(0, MAX_SLUG_KEY_LENGTH)}:${id}`,
        );
    } catch (err) {
        console.error(
            "[rate-limit] Redis check failed - allowing request",
            err,
        );
        return { allowed: true };
    }
}

/**
 * Schedules a limiter's background work to run to completion after the response
 * is sent. Errors are swallowed and logged: a failed sync must never surface.
 * after() throws outside a request scope (unit tests, scripts), so that case is
 * caught and ignored too.
 */
function keepAlive(pending: Promise<unknown>): void {
    try {
        after(() =>
            pending.catch((err) =>
                console.error("[rate-limit] background sync failed", err),
            ),
        );
    } catch {
        // Not in a request scope: nothing to keep alive.
    }
}

/** Builds the "blocked" result with standard Retry-After / X-RateLimit-* headers. */
function deny(r: {
    limit: number;
    remaining: number;
    reset: number;
}): RateLimitResult {
    // `reset` is a Unix-ms timestamp for when the client may try again.
    const retryAfterSeconds = Math.max(
        1,
        Math.ceil((r.reset - Date.now()) / 1000),
    );
    return {
        allowed: false,
        retryAfterSeconds,
        headers: {
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(r.limit),
            "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
            "X-RateLimit-Reset": String(Math.ceil(r.reset / 1000)),
        },
    };
}
