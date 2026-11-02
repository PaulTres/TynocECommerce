import Link from "next/link";

interface Props {
    title: string;
    message: string;
    actionHref?: string;
    actionLabel?: string;
}

/** Reusable empty state: says what is missing and offers the next step. */
export function EmptyState({ title, message, actionHref, actionLabel }: Props) {
    return (
        <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-14 text-center">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate">
                {message}
            </p>
            {actionHref && actionLabel && (
                <Link href={actionHref} className="btn-primary mt-6">
                    {actionLabel}
                </Link>
            )}
        </div>
    );
}
