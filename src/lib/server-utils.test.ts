import { describe, expect, it } from "vitest";
import { getClientIp, normalizeIp } from "./server-utils";

describe("getClientIp", () => {
    it("returns the x-real-ip header when available", async () => {
        const headers = new Headers({
            "x-real-ip": "192.168.1.10",
            "x-forwarded-for": "10.0.0.1",
        });

        expect(getClientIp(headers)).toBe("192.168.1.10");
    });

    it("trims whitespace from x-real-ip", async () => {
        const headers = new Headers({
            "x-real-ip": "  192.168.1.10  ",
        });

        expect(getClientIp(headers)).toBe("192.168.1.10");
    });

    it("uses the first x-forwarded-for address when x-real-ip is absent", async () => {
        const headers = new Headers({
            "x-forwarded-for": "192.168.1.10, 10.0.0.1, 10.0.0.2",
        });

        expect(getClientIp(headers)).toBe("192.168.1.10");
    });

    it("trims the first forwarded address", async () => {
        const headers = new Headers({
            "x-forwarded-for": " 192.168.1.10 , 10.0.0.1",
        });

        expect(getClientIp(headers)).toBe("192.168.1.10");
    });

    it("returns unknown when no IP headers exist", async () => {
        expect(getClientIp(new Headers())).toBe("unknown");
    });

    it("returns unknown for an invalid IP", async () => {
        const headers = new Headers({
            "x-real-ip": "not-an-ip",
        });

        expect(getClientIp(headers)).toBe("unknown");
    });

    it("returns unknown for an empty IP", async () => {
        const headers = new Headers({
            "x-real-ip": " ",
        });

        expect(getClientIp(headers)).toBe("unknown");
    });

    it("returns IPv4 addresses unchanged", async () => {
        const headers = new Headers({
            "x-real-ip": "203.0.113.42",
        });

        expect(getClientIp(headers)).toBe("203.0.113.42");
    });

    it("normalizes IPv6 addresses to their /64 prefix", async () => {
        const first = new Headers({
            "x-real-ip": "2001:db8:abcd:1234:1111:2222:3333:4444",
        });

        const second = new Headers({
            "x-real-ip": "2001:db8:abcd:1234:aaaa:bbbb:cccc:dddd",
        });

        expect(getClientIp(first)).toBe("2001:db8:abcd:1234::/64");
        expect(getClientIp(second)).toBe("2001:db8:abcd:1234::/64");
    });

    it("normalizes compressed IPv6 addresses", async () => {
        const headers = new Headers({
            "x-real-ip": "2001:db8::1",
        });

        expect(getClientIp(headers)).toBe("2001:db8:0:0::/64");
    });

    it("normalizes IPv6 addresses containing a zone identifier", async () => {
        const headers = new Headers({
            "x-real-ip": "fe80::1%eth0",
        });

        expect(getClientIp(headers)).toBe("fe80:0:0:0::/64");
    });

    it("converts IPv4-mapped IPv6 addresses to IPv4", async () => {
        const headers = new Headers({
            "x-real-ip": "::ffff:192.168.1.10",
        });

        expect(getClientIp(headers)).toBe("192.168.1.10");
    });
});

describe("normalizeIp", () => {
    describe("IPv4 addresses", () => {
        it("should return a standard IPv4 address unchanged", () => {
            expect(normalizeIp("192.168.1.100")).toBe("192.168.1.100");
        });

        it("should return a public IPv4 address unchanged", () => {
            expect(normalizeIp("8.8.8.8")).toBe("8.8.8.8");
        });

        it("should return IPv4 addresses unchanged even with a /64-like suffix", () => {
            expect(normalizeIp("10.0.0.1")).toBe("10.0.0.1");
        });
    });

    describe("IPv6 addresses", () => {
        it("should collapse a full IPv6 address to its /64 prefix", () => {
            expect(normalizeIp("2001:0db8:0000:0001:0000:0000:0000:0001")).toBe(
                "2001:db8:0:1::/64",
            );
        });

        it("should collapse a compressed IPv6 address to its /64 prefix", () => {
            expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
        });

        it("should normalize equivalent IPv6 addresses to the same prefix", () => {
            const first = normalizeIp("2001:db8:0:1::1");
            const second = normalizeIp(
                "2001:0db8:0000:0001:abcd:1234:5678:9abc",
            );

            expect(first).toBe(second);
            expect(first).toBe("2001:db8:0:1::/64");
        });

        it("should keep only the first four groups", () => {
            expect(normalizeIp("2001:db8:abcd:1234:5678:9abc:def0:1234")).toBe(
                "2001:db8:abcd:1234::/64",
            );
        });

        it("should normalize uppercase hexadecimal groups to lowercase", () => {
            expect(normalizeIp("2001:DB8:ABCD:1234::1")).toBe(
                "2001:db8:abcd:1234::/64",
            );
        });

        it("should remove leading zeros from groups", () => {
            expect(normalizeIp("2001:0db8:000a:0001::1")).toBe(
                "2001:db8:a:1::/64",
            );
        });

        it("should normalize the IPv6 loopback address", () => {
            expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
        });

        it("should normalize the IPv6 unspecified address", () => {
            expect(normalizeIp("::")).toBe("0:0:0:0::/64");
        });

        it("should normalize an IPv6 address with leading zero groups", () => {
            expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
        });
    });

    describe("IPv4-mapped IPv6 addresses", () => {
        it("should convert IPv4-mapped IPv6 addresses to IPv4", () => {
            expect(normalizeIp("::ffff:192.168.1.1")).toBe("192.168.1.1");
        });

        it("should handle uppercase IPv4-mapped IPv6 notation", () => {
            expect(normalizeIp("::FFFF:192.168.1.1")).toBe("192.168.1.1");
        });

        it("should preserve the mapped IPv4 address rather than collapsing it", () => {
            expect(normalizeIp("::ffff:8.8.8.8")).toBe("8.8.8.8");
        });
    });

    describe("IPv6 zone identifiers", () => {
        it("should remove an interface zone identifier", () => {
            expect(normalizeIp("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
        });

        it("should remove a numeric zone identifier", () => {
            expect(normalizeIp("fe80::1%2")).toBe("fe80:0:0:0::/64");
        });

        it("should handle zone identifiers on IPv4-mapped IPv6 addresses", () => {
            expect(normalizeIp("::ffff:192.168.1.1%eth0")).toBe("192.168.1.1");
        });
    });

    describe("Invalid and non-IP inputs", () => {
        it("should return an invalid IP address unchanged", () => {
            expect(normalizeIp("not-an-ip")).toBe("not-an-ip");
        });

        it("should return an empty string unchanged", () => {
            expect(normalizeIp("")).toBe("");
        });

        it("should return an invalid IPv6 address unchanged", () => {
            expect(normalizeIp("2001:db8::gggg")).toBe("2001:db8::gggg");
        });

        it("should return an invalid IPv4 address unchanged", () => {
            expect(normalizeIp("999.999.999.999")).toBe("999.999.999.999");
        });

        it("should return a hostname unchanged", () => {
            expect(normalizeIp("localhost")).toBe("localhost");
        });
    });
});
