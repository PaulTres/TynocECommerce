"use client";

/** Last-resort error boundary.*/
export default function GlobalError({ reset }: { reset: () => void }) {
    return (
        <html lang="en">
            <body
                style={{
                    padding: "4rem",
                    textAlign: "center",
                    fontFamily: "system-ui",
                }}
            >
                <h1>Something went wrong</h1>
                <button onClick={reset}>Try again</button>
            </body>
        </html>
    );
}
