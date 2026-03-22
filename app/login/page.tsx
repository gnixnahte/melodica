import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border p-6">
        <h1 className="text-xl font-bold">Log in</h1>
        <p className="mt-1 text-sm opacity-80">
          Auth will come later (Supabase). For now this is UI.
        </p>

        <form className="mt-6 space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="email"
              placeholder="you@email.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Password</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <button
            type="button"
            className="auth-glow-btn w-full rounded-md bg-black px-4 py-2 text-sm text-white transition-all duration-200"
          >
            Continue
          </button>
        </form>

        <div className="mt-4 text-sm">
          <Link className="underline" href="/dashboard">
            Skip for now → Dashboard
          </Link>
        </div>

        <div className="mt-6 text-sm">
          <Link className="opacity-80 underline" href="/">
            Back to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
