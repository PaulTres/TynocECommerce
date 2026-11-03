import { auth } from "@/lib/auth/server";
import { AppError, ConflictError } from "@/lib/errors";
import type { RegisterInput } from "@/lib/validation/schemas";
import type { User } from "@/types";

type AuthUser = {
    id: string;
    email: string;
    name?: string | null;
    createdAt?: Date | string;
};

function toPublicUser(user: AuthUser): User {
    return {
        id: user.id,
        email: user.email,
        name: user.name ?? "",
        createdAt: user.createdAt
            ? new Date(user.createdAt).toISOString()
            : new Date().toISOString(),
    };
}

function errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error)
        return String(error.code);
    return "";
}

/** Creates the identity in Neon Managed Auth; passwords never enter our app tables. */
export async function registerUser(input: RegisterInput): Promise<User> {
    const { data, error } = await auth.signUp.email({
        email: input.email,
        password: input.password,
        name: input.name,
    });
    if (error) {
        const code = errorCode(error).toUpperCase();
        if (code.includes("USER_ALREADY_EXISTS") || code.includes("EMAIL_ALREADY_EXISTS"))
            throw new ConflictError("An account with this email already exists");
        throw new AppError("AUTH_ERROR", 400, "We could not create your account");
    }

    const user = data?.user as AuthUser | undefined;
    if (!user) throw new Error("Neon Auth created the account without returning a user");
    return toPublicUser(user);
}

/** Signs in through Neon Managed Auth and returns generic failure for bad credentials. */
export async function verifyCredentials(
    email: string,
    password: string,
): Promise<User | null> {
    const { data, error } = await auth.signIn.email({ email, password });
    if (error || !data?.user) return null;
    return toPublicUser(data.user as AuthUser);
}
