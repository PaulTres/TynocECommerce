/** Route-level loading UI shown by Next.js while a page's server data is being fetched. */
export default function Loading() {
  return <div className="h-64 animate-pulse rounded-lg bg-line/60" role="status" aria-label="Loading" />;
}
