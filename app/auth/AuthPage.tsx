"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OAuthProvider = "google";

const OWNER_EMAIL = "ethanxing2007@gmail.com";

export type AuthPageVariant = "signup" | "login";

export function AuthPage({ variant = "signup" }: { variant?: AuthPageVariant }) {
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

  const title = variant === "signup" ? "Sign up" : "Log in";
  const subtitle =
    variant === "signup"
      ? "Continue with Google to authenticate. After you sign in, you can open the dashboard and your projects."
      : "Continue with Google to access your projects.";

  return (
    <main className="landing-page-bg relative flex min-h-screen items-center justify-center overflow-hidden p-8">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/landing-reference.png"
          alt=""
          aria-hidden="true"
          fill
          priority
          className="object-cover object-right opacity-[0.1] blur-[1px] saturate-50"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/38 via-zinc-900/46 to-zinc-950/66" />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200/25 bg-zinc-900/62 p-7 backdrop-blur-md">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        <p className="mt-2 text-base text-zinc-200/90">{subtitle}</p>
        {searchParams.get("unauthorized") === "1" && !errorMessage && (
          <p className="mt-4 rounded-md border border-amber-300/70 bg-amber-50/85 px-3 py-2 text-sm text-amber-800">
            Only {OWNER_EMAIL} can access this app.
          </p>
        )}

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void handleOAuth("google")}
            disabled={loadingProvider !== null}
            className="auth-glow-btn w-full rounded-md border border-white/70 bg-white/85 px-5 py-3 text-base font-semibold text-zinc-900 transition-all duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingProvider === "google" ? "Connecting..." : "Continue with Google"}
          </button>
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-md border border-red-300/80 bg-red-50/80 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-7 text-base">
          <Link className="text-zinc-200/90 underline hover:text-white" href="/">
            Back to landing
          </Link>
        </div>
      </div>
    </main>
  );
}
