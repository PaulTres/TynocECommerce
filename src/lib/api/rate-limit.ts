import {
    MultiRegionRatelimit,
    Ratelimit,
    type Duration,
} from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import "server-only"; // build fails if this file is ever imported into browser code

// This module implements Redis-backed rate limiting (Upstash, sliding window).
// Three independent buckets protect login/register:
//global - per client IP, across all forms (slows down scanners)
//perForm - per client IP, per form (slows down brute force from one source)
//identifier - per submitted identifier (e.g. email), regardless of IP(slows down distributed attacks against one account)

/** Max submissions per client IP per form within PER_FORM_WINDOW (login + register). */
export const PER_FORM_LIMIT = 5;
export const PER_FORM_WINDOW = "1 m" as const;

/** Max submissions per client IP across all forms within GLOBAL_WINDOW. */
export const GLOBAL_LIMIT = 30;
export const GLOBAL_WINDOW = "1 h" as const;

/**
 * Max attempts per identifier (email) within IDENTIFIER_WINDOW.
 * Keep this generous: an attacker can deliberately burn a victim's budget
 * (account lock-out DoS), so it should only stop sustained guessing.
 */
export const IDENTIFIER_LIMIT = 50;
export const IDENTIFIER_WINDOW = "15 m" as const;

/** Allow the request if Redis does not answer within this many ms (fail-open). */
export const REDIS_TIMEOUT_MS = 1500;

/** Caps the form name used inside Redis keys so keys can never grow unbounded. */
export const MAX_SLUG_KEY_LENGTH = 64;

/** What the caller needs to know after a check. */
export type RateLimitResult =
    | { allowed: true }
    | {
          allowed: false;
          retryAfterSeconds: number;
          headers: Record<string, string>;
      };

/**
 * Anything that carries headers. A `Request` (route handlers, Auth.js `authorize`)
 * satisfies this, and so does `{ headers: await headers() }` in a server action.
 */
export type HeadersCarrier = { headers: Headers };

// The only thing we need from a limiter. Ratelimit and MultiRegionRatelimit both satisfy it.
type Limiter = Pick<Ratelimit, "limit">;
type Limiters = { global: Limiter; perForm: Limiter; identifier: Limiter };

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
 * Collapses an IPv6 address to its /64 prefix.
 * One home/ISP connection usually owns a whole /64 (2^64 addresses), so
 * keying on the full address would let an attacker rotate IPs and dodge the
 * limit. IPv4 and unparseable values are returned unchanged.
 */
function normalizeIp(ip: string): string {
    const addr = String(ip.split("%")[0]); // drop any IPv6 zone id like "%eth0"
    if (isIP(addr) !== 6) return addr;

    // IPv4-mapped IPv6 (::ffff:1.2.3.4) is really an IPv4 client.
    const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mapped) return String(mapped[1]);

    // Expand "::" into the right number of zero groups, then keep the first 4 groups.
    const [head, tail] = addr.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const zeros =
        tail === undefined
            ? 0
            : Math.max(0, 8 - headGroups.length - tailGroups.length);
    const groups = [
        ...headGroups,
        ...Array<string>(zeros).fill("0"),
        ...tailGroups,
    ];
    const prefix = groups
        .slice(0, 4)
        .map((g) => (parseInt(g, 16) || 0).toString(16));
    return `${prefix.join(":")}::/64`;
}

/**
 * Extracts the client IP from proxy headers.
 * Returns "unknown" if no valid IP is found (all such clients share one bucket).
 */
export function getClientIp(headers: Headers): string {
    const candidate =
        headers.get("x-real-ip")?.trim() ||
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "";
    return isIP(String(candidate.split("%")[0]))
        ? normalizeIp(candidate)
        : "unknown";
}

/**
 * Hashes a value before it is used as a Redis key, so raw IPs / emails (personal data) never sit in Redis.
 */
function hashKey(value: string): string {
    const hasher = createHash("sha256");
    return hasher.update(value).digest("hex").slice(0, 32);
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
 * Turns a retry delay into a short user-facing message.
 * Rounds up to whole minutes once it exceeds a minute so the text stays readable
 * ("Try again in 14 minutes" instead of "in 837 seconds").
 */
export function tooManyAttemptsMessage(retryAfterSeconds: number): string {
    const wait =
        retryAfterSeconds < 60
            ? `${retryAfterSeconds} seconds`
            : `${Math.ceil(retryAfterSeconds / 60)} minutes`;
    return `Too many attempts. Please try again in ${wait}.`;
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
