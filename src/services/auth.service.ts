import { BCRYPT_ROUNDS } from "@/lib/constants";
import * as usersRepo from "@/lib/db/users.repo";
import type { RegisterInput } from "@/lib/validation/schemas";
import type { User } from "@/types";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

// A real bcrypt hash of a random string, compared against when the email is unknown so that
// "no such user" and "wrong password" take the same time (mitigates user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

/** Strips the password hash so the result is safe to return to callers and the UI. */
function toPublicUser(u: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
}): User {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
}

/**
 * Registers a new account.
 * Hashes the validated password with bcrypt, then delegates to the repository,
 * whose transactional email lock guarantees uniqueness.
 * @throws ConflictError if the email is taken.
 */
export async function registerUser(input: RegisterInput): Promise<User> {
    const record = {
        id: randomUUID(),
        email: input.email,
        name: input.name,
        createdAt: new Date().toISOString(),
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    };
    await usersRepo.createUser(record);
    return toPublicUser(record);
}

/**
 * Verifies an email/password pair for Auth.js' Credentials provider.
 * @returns the public user on success, otherwise null. Never says which part was wrong.
 */
export async function verifyCredentials(
    email: string,
    password: string,
): Promise<User | null> {
    const user = await usersRepo.getUserByEmail(email);
    //if the user does not exist we still run a full hashing, otherwise an attacker could learn which accounts exist by measuring response times;
    //the comparison takes around 250 ms, longer than a regular if-else; for removal just add an if(user==null)return null;
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    return user && ok ? toPublicUser(user) : null;
}
