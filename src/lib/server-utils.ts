import { isIP } from "node:net";
//Holds all the stuff that cannot be imported by client components.

/**
 * Collapses an IPv6 address to its /64 prefix.
 * One home/ISP connection usually owns a whole /64 (2^64 addresses), so
 * keying on the full address would let an attacker rotate IPs and dodge the
 * limit. IPv4 and unparseable values are returned unchanged.
 */
export function normalizeIp(ip: string): string {
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
