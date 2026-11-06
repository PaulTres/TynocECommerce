import { getRequestAuth } from "@/lib/auth/request";
import { anonymousAuth } from "@/lib/auth/server";
import { UnauthorizedError } from "@/lib/errors";
import { DataApiRequestOptions } from "@/types";
import { cache } from "react";
import "server-only";

const getAccessToken = cache(async (): Promise<string> => {
    const requestAuth = await getRequestAuth();
    if (!requestAuth) throw new UnauthorizedError();

    const { data, error } = await requestAuth.token();
    if (error || !data?.token) throw new UnauthorizedError();
    return data.token;
});

async function getAnonymousAccessToken(): Promise<string> {
    const token = await anonymousAuth.getJWTToken();
    if (!token)
        throw new Error("Neon Auth did not return an anonymous Data API token");
    return token;
}

function getResourceUrl(resource: string, query?: URLSearchParams): string {
    const configuredUrl = process.env.NEON_DATA_API_URL;
    if (!configuredUrl) throw new Error("NEON_DATA_API_URL is required");

    const url = new URL(configuredUrl);
    if (url.username || url.password)
        throw new Error(
            "NEON_DATA_API_URL must not contain database credentials",
        );
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
        throw new Error("NEON_DATA_API_URL must use HTTPS in production");

    const configuredPath = url.pathname.replace(/\/+$/, "");
    const restPath = configuredPath.endsWith("/rest/v1")
        ? configuredPath
        : configuredPath + "/rest/v1";
    const resourcePath = resource
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    url.pathname = restPath + "/" + resourcePath;
    url.search = query?.toString() ?? "";
    url.hash = "";
    return url.toString();
}

/** Calls the Neon Data API with a short-lived Neon Auth JWT. */
export async function dataApi<T>(
    resource: string,
    options: DataApiRequestOptions,
): Promise<T> {
    const headers: Record<string, string> = {
        Accept: "application/json",
    };
    const token =
        options.access === "authenticated"
            ? await getAccessToken()
            : await getAnonymousAccessToken();
    headers.Authorization = "Bearer " + token;
    if (options.body !== undefined)
        headers["Content-Type"] = "application/json";
    if (options.prefer) headers.Prefer = options.prefer;

    const response = await fetch(getResourceUrl(resource, options.query), {
        method: options.method ?? "GET",
        headers,
        body:
            options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
        cache: "no-store",
    });

    const responseText = await response.text();
    if (!response.ok) {
        let message = response.statusText || "Request failed";
        try {
            const payload: unknown = JSON.parse(responseText);
            if (
                payload &&
                typeof payload === "object" &&
                "message" in payload &&
                typeof payload.message === "string"
            ) {
                message = payload.message;
            }
        } catch {
            // Keep the HTTP status text instead of returning an arbitrary body.
        }
        throw new Error(
            "Neon Data API request failed (" +
                response.status +
                "): " +
                message,
        );
    }

    if (!responseText) return [] as T;
    return JSON.parse(responseText) as T;
}
