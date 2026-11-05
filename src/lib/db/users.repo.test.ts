import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    MISSING_AUTH_CLAIMS_MESSAGE,
    MISSING_MAPPING_MESSAGE,
} from "../constants";
import { dataApi } from "./data-api";
import { getOrCreateAppUser } from "./users.repo";

vi.mock("./data-api", () => ({
    dataApi: vi.fn(),
}));

const mockedDataApi = vi.mocked(dataApi);

describe("getOrCreateAppUser", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    it("returns the app user ID when the mapping exists", async () => {
        mockedDataApi.mockResolvedValueOnce([{ id: "user-123" }]);

        await expect(getOrCreateAppUser()).resolves.toBe("user-123");

        expect(mockedDataApi).toHaveBeenCalledTimes(1);
        expect(mockedDataApi).toHaveBeenCalledWith(
            "rpc/get_or_create_app_user",
            {
                access: "authenticated",
                method: "POST",
                body: {},
            },
        );
    });

    it("throws when Neon returns no app user mapping", async () => {
        mockedDataApi.mockResolvedValueOnce([]);

        await expect(getOrCreateAppUser()).rejects.toThrow(
            MISSING_MAPPING_MESSAGE,
        );

        expect(mockedDataApi).toHaveBeenCalledTimes(1);
    });

    it("throws when the returned user ID is empty", async () => {
        mockedDataApi.mockResolvedValueOnce([{ id: "" }]);

        await expect(getOrCreateAppUser()).rejects.toThrow(
            MISSING_MAPPING_MESSAGE,
        );

        expect(mockedDataApi).toHaveBeenCalledTimes(1);
    });

    it("retries once when authenticated JWT claims are missing", async () => {
        vi.useFakeTimers();

        mockedDataApi
            .mockRejectedValueOnce(new Error(MISSING_AUTH_CLAIMS_MESSAGE))
            .mockResolvedValueOnce([{ id: "user-123" }]);

        const resultPromise = getOrCreateAppUser();

        expect(mockedDataApi).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(25);

        await expect(resultPromise).resolves.toBe("user-123");

        expect(mockedDataApi).toHaveBeenCalledTimes(2);
    });

    it("throws when the retry fails", async () => {
        vi.useFakeTimers();

        const retryError = new Error("Database unavailable");

        mockedDataApi
            .mockRejectedValueOnce(new Error(MISSING_AUTH_CLAIMS_MESSAGE))
            .mockRejectedValueOnce(retryError);

        const resultPromise = getOrCreateAppUser();
        const assertion = expect(resultPromise).rejects.toThrow(retryError);

        await vi.advanceTimersByTimeAsync(25);

        await assertion;

        expect(mockedDataApi).toHaveBeenCalledTimes(2);
    });

    it("does not retry when an unrelated error occurs", async () => {
        const error = new Error("Database connection failed");

        mockedDataApi.mockRejectedValueOnce(error);

        await expect(getOrCreateAppUser()).rejects.toThrow(error);

        expect(mockedDataApi).toHaveBeenCalledTimes(1);
    });

    it("does not retry when a non-Error value is thrown", async () => {
        mockedDataApi.mockRejectedValueOnce("Unexpected failure");

        await expect(getOrCreateAppUser()).rejects.toBe("Unexpected failure");

        expect(mockedDataApi).toHaveBeenCalledTimes(1);
    });

    it("does not retry more than once", async () => {
        vi.useFakeTimers();

        mockedDataApi
            .mockRejectedValueOnce(new Error(MISSING_AUTH_CLAIMS_MESSAGE))
            .mockRejectedValueOnce(new Error(MISSING_AUTH_CLAIMS_MESSAGE));

        const resultPromise = getOrCreateAppUser();

        //attach rejection handler before advancing time
        const assertion = expect(resultPromise).rejects.toThrow(
            MISSING_AUTH_CLAIMS_MESSAGE,
        );

        await vi.advanceTimersByTimeAsync(25);

        await assertion;

        expect(mockedDataApi).toHaveBeenCalledTimes(2);
    });
});
