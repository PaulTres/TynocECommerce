/* eslint-disable @typescript-eslint/no-explicit-any*/
import { describe, expect, it, vi } from "vitest";
import { SITE_NAME } from "@/lib/constants";
import { getUserDisplayName, getUserId } from "@/lib/api/session";
import { Header } from "./Header";

const mocks = vi.hoisted(() => ({ userId: vi.fn(), displayName: vi.fn(), cart: vi.fn(), wishlist: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ getUserDisplayName: mocks.displayName, getUserId: mocks.userId }));
vi.mock("@/services/cart.service", () => ({ getCartCount: mocks.cart }));
vi.mock("@/services/wishlist.service", () => ({ getWishlistCount: mocks.wishlist }));
vi.mock("@/actions/auth", () => ({ logoutAction: mocks.logout }));

describe("Header", () => {
    it("renders the branded search and login navigation for guests", async () => {
        mocks.userId.mockResolvedValue(null);
        mocks.displayName.mockResolvedValue(null);
        const element = await Header();
        const children = element.props.children.props.children;
        expect(children[0].props.children).toBe(SITE_NAME);
        expect(children[1].props.role).toBe("search");
        expect(children[2].props.children.some((child: any) => child?.props?.href === "/login")).toBe(true);
        expect(getUserId).toHaveBeenCalled();
        expect(getUserDisplayName).toHaveBeenCalled();
    });

    it("shows the signed-in display name and sign-out action", async () => {
        mocks.userId.mockResolvedValue("u1");
        mocks.displayName.mockResolvedValue("Ada");
        mocks.cart.mockResolvedValue(3);
        mocks.wishlist.mockResolvedValue(2);
        const element = await Header();
        const nav = element.props.children.props.children[2];
        const authBlock = nav.props.children[3];
        expect(authBlock.props.children[0].props.action).toBe(mocks.logout);
        expect(authBlock.props.children[1].props.children).toBe("Ada");
        const wishlistElement = nav.props.children[1].props.children;
        const cartElement = nav.props.children[2].props.children;
        const [wishlist, cart] = await Promise.all([
            wishlistElement.type(wishlistElement.props),
            cartElement.type(cartElement.props),
        ]);
        expect(wishlist.props.children[1].props.children).toBe(2);
        expect(cart.props.children[1].props.children).toBe(3);
        expect(mocks.cart).toHaveBeenCalledWith("u1");
        expect(mocks.wishlist).toHaveBeenCalledWith("u1");
    });
});
