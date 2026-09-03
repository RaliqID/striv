"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div
        role="alert"
        className="w-full max-w-md bg-error-container rounded-xl p-8 flex flex-col items-center text-center space-y-6"
      >
        <span className="material-symbols-outlined text-on-error-container text-6xl">
          sentiment_dissatisfied
        </span>

        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-error-container">
            Something went wrong
          </h1>
          <p className="font-body-md text-body-md text-on-error-container/80">
            An unexpected error occurred. You can try again or head back to the dashboard.
          </p>
        </div>

        {error.digest && (
          <p className="font-metric-sm text-metric-sm text-on-error-container/60">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <button
            onClick={() => reset()}
            className="bg-primary text-on-primary rounded-lg px-6 py-3 font-metric-sm text-metric-sm hover:bg-primary/90 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary w-full sm:w-auto"
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-on-error-container font-metric-sm text-metric-sm underline underline-offset-2 hover:text-on-error-container/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary w-full sm:w-auto"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
