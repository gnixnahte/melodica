"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OAuthProvider = "google";
const OWNER_EMAIL = "ethanxing2007@gmail.com";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        const sessionEmail = data.session.user.email?.toLowerCase() ?? "";
        if (sessionEmail !== OWNER_EMAIL) {
          await supabase.auth.signOut({ scope: "local" });
          setErrorMessage(`Only ${OWNER_EMAIL} can access this app.`);
          return;
        }
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
      options: {
        redirectTo,
        queryParams: {
          prompt: "select_account",
          login_hint: OWNER_EMAIL,
        },
      },
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
          Continue with Google to access your projects.
        </p>
        {searchParams.get("unauthorized") === "1" && !errorMessage && (
          <p className="mt-3 rounded-md border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-300/30 dark:bg-amber-900/20 dark:text-amber-200">
            Only {OWNER_EMAIL} can access this app.
          </p>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void handleOAuth("google")}
            disabled={loadingProvider !== null}
            className="auth-glow-btn w-full rounded-md border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-800 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-zinc-800/60 dark:text-slate-100 dark:hover:bg-zinc-700/70"
          >
            {loadingProvider === "google" ? "Connecting..." : "Continue with Google"}
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
