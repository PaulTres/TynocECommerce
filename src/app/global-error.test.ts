import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

describe("GlobalError", () => {
    it("renders a standalone document and retries when requested", () => {
        const reset = vi.fn();
        type NodeProps = { children?: ReactNode; onClick?: () => void };
        const tree = GlobalError({ reset }) as ReactElement<{ children: ReactElement<NodeProps> }>;
        const body = tree.props.children;
        const bodyChildren = body.props.children as ReactElement<NodeProps>[];
        expect(tree.type).toBe("html");
        expect(body.type).toBe("body");
        expect(bodyChildren[0].props.children).toBe("Something went wrong");
        bodyChildren[1].props.onClick?.();
        expect(reset).toHaveBeenCalledOnce();
    });
});
