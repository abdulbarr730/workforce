"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6 font-sans">
          <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
            <h1 className="text-5xl font-black text-rose-500">500</h1>
            <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
            <p className="text-sm text-slate-500">
              An unexpected system error occurred. Please try again or return to the dashboard.
            </p>
            <div className="pt-2 flex gap-3 justify-center">
              <button
                onClick={() => reset()}
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition"
              >
                Dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
