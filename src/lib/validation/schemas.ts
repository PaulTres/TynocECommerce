import {
  MAX_CATEGORY_LENGTH,
  MAX_CURSOR_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASS_LENGTH,
  MAX_PRODUCT_ID_LENGTH,
  MAX_QTY_PER_ITEM,
  MIN_PASS_LENGTH,
  PAGE_SIZE,
  PRODUCT_ID_PATTERN,
} from "@/lib/constants";
import { z } from "zod";

export const productIdSchema = z
    .string()
    .min(1)
    .max(MAX_PRODUCT_ID_LENGTH)
    .regex(PRODUCT_ID_PATTERN, "Invalid product id");

export const registerSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Name must be at least 2 characters")
        .max(MAX_NAME_LENGTH),
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Enter a valid email address")
        .max(MAX_EMAIL_LENGTH),
    password: z
        .string()
        .min(
            MIN_PASS_LENGTH,
            `Password must be at least ${MIN_PASS_LENGTH} characters`,
        )
        .max(
            MAX_PASS_LENGTH,
            `Password must be at most ${MAX_PASS_LENGTH} characters`,
        )
        .regex(/[A-Za-z]/, "Password needs at least one letter")
        .regex(/[0-9]/, "Password needs at least one number"),
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(MAX_EMAIL_LENGTH),
    password: z.string().min(MIN_PASS_LENGTH).max(MAX_PASS_LENGTH),
});

export const addToCartSchema = z.object({
    productId: productIdSchema,
    quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_ITEM).default(1),
});

/** Quantity 0 is allowed and means "remove this line". */
export const updateCartSchema = z.object({
    productId: productIdSchema,
    quantity: z.coerce.number().int().min(0).max(MAX_QTY_PER_ITEM),
});

export const wishlistSchema = z.object({ productId: productIdSchema });

/** Query-string schema for the product listing; bad values throw. */
export const productQuerySchema = z
    .object({
        q: z.string().trim().max(MAX_PRODUCT_ID_LENGTH).optional(),
        category: z
            .string()
            .regex(PRODUCT_ID_PATTERN)
            .max(MAX_CATEGORY_LENGTH)
            .optional(),
        min: z.coerce.number().min(0).max(1_000_000).optional(),
        max: z.coerce.number().min(0).max(1_000_000).optional(),
        sort: z.enum(["newest", "price-asc", "price-desc"]).default("newest"),
        limit: z.coerce.number().int().min(1).max(48).default(PAGE_SIZE),
        cursor: z.string().max(MAX_CURSOR_LENGTH).optional(),
    })
    .refine(
        (v) => v.min === undefined || v.max === undefined || v.min <= v.max,
        {
            message: "min must be <= max",
            path: ["min"],
        },
    );

export type RegisterInput = z.infer<typeof registerSchema>;
