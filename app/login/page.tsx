"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OAuthProvider = "google" | "github";

export default function LoginPage() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        router.replace("/dashboard");
      }
    };

    void checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleOAuth = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    setErrorMessage(null);
    const redirectTo = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });

    if (error) {
      setErrorMessage(error.message);
      setLoadingProvider(null);
    }
  };

  return (
    <main className="min-h-screen p-8 flex items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border p-6">
        <h1 className="text-xl font-bold">Log in</h1>
        <p className="mt-1 text-sm opacity-80">
          Continue with OAuth to access your projects.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void handleOAuth("google")}
            disabled={loadingProvider !== null}
            className="auth-glow-btn w-full rounded-md border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-800 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70"
          >
            {loadingProvider === "google" ? "Connecting..." : "Continue with Google"}
          </button>

          <button
            type="button"
            onClick={() => void handleOAuth("github")}
            disabled={loadingProvider !== null}
            className="auth-glow-btn w-full rounded-md bg-black px-4 py-2 text-sm text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === "github" ? "Connecting..." : "Continue with GitHub"}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-300/30 dark:bg-red-900/25 dark:text-red-200">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 text-sm">
          <Link className="opacity-80 underline" href="/">
            Back to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
