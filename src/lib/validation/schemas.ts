import { z } from "zod";
import { MAX_QTY_PER_ITEM, PAGE_SIZE, PRODUCT_ID_PATTERN } from "@/lib/constants";

export const productIdSchema = z.string().min(1).max(100).regex(PRODUCT_ID_PATTERN, "Invalid product id");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[A-Za-z]/, "Password needs at least one letter")
    .regex(/[0-9]/, "Password needs at least one number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
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

/** Query-string schema for the product listing; bad values fall back to safe defaults. */
export const productQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().regex(PRODUCT_ID_PATTERN).max(60).optional(),
    min: z.coerce.number().min(0).max(1_000_000).optional(),
    max: z.coerce.number().min(0).max(1_000_000).optional(),
    sort: z.enum(["newest", "price-asc", "price-desc"]).default("newest"),
    limit: z.coerce.number().int().min(1).max(48).default(PAGE_SIZE),
    cursor: z.string().max(2000).optional(),
  })
  .refine((v) => v.min === undefined || v.max === undefined || v.min <= v.max, {
    message: "min must be <= max",
    path: ["min"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
