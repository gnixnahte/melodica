"use client";

import { Suspense } from "react";
import { AuthPage } from "@/app/auth/AuthPage";

function SignupContent() {
  return <AuthPage variant="signup" />;
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="landing-page-bg flex min-h-screen items-center justify-center p-8">
          <p className="text-sm text-slate-200/80">Loading…</p>
        </main>
      }
    >
      <SignupContent />
    </Suspense>
  );
}
