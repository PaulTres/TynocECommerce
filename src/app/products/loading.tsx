import { ProductGridSkeleton } from "@/components/ProductGrid";

/** Skeleton for the listing page while filters/search are being applied. */
export default function Loading() {
  return <ProductGridSkeleton count={12} />;
}
