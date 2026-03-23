"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["800"],
});

export default function Home() {
  const [heroOpacity, setHeroOpacity] = useState(1);

  useEffect(() => {
    const updateOpacity = () => {
      const viewportHeight = Math.max(1, window.innerHeight);
      const progress = Math.min(1, window.scrollY / (viewportHeight * 0.85));
      setHeroOpacity(1 - progress);
    };

    updateOpacity();
    window.addEventListener("scroll", updateOpacity, { passive: true });
    window.addEventListener("resize", updateOpacity);
    return () => {
      window.removeEventListener("scroll", updateOpacity);
      window.removeEventListener("resize", updateOpacity);
    };
  }, []);

  return (
    <div className="landing-page-bg relative px-6 md:px-10 lg:px-16">
      <div
        className="landing-hero-art pointer-events-none absolute right-0 top-0 hidden h-screen w-[56vw] min-w-[760px] max-w-[1200px] lg:block"
        style={{ opacity: 0.9 * heroOpacity }}
      >
        <svg
          className="landing-hero-svg"
          viewBox="0 0 1280 878"
          preserveAspectRatio="xMaxYMid slice"
          aria-hidden="true"
        >
          <image href="/landing-reference.png" width="1280" height="878" />

        </svg>
        <div className="landing-hero-fade absolute inset-0" />
      </div>

      <main className="mx-auto w-full max-w-5xl md:ml-8 lg:ml-14">
        <section className="relative flex min-h-screen flex-col justify-center">
          <h1 className={`${plusJakarta.className} landing-glass-title relative z-10 inline-block text-7xl font-black tracking-tight sm:text-8xl md:text-9xl`}>
            Melodica
          </h1>
          <p className="relative z-10 mt-5 max-w-3xl text-2xl font-semibold leading-tight text-slate-100 sm:text-3xl">
            Create your own melodies with the music editor in seconds.
          </p>
          <p className="relative z-10 mt-4 max-w-2xl text-base text-slate-300/75 sm:text-lg">
            Build ideas fast, tweak them live, and export when you are ready.
          </p>
          <div className="relative z-10 mt-10 flex flex-wrap gap-3">
            <Link href="/login" className="auth-glow-btn rounded-md border border-white/25 bg-white/90 px-6 py-3 text-base font-semibold text-slate-900 shadow-sm backdrop-blur hover:bg-white">
              Get Started
            </Link>
            <Link href="/dashboard" className="auth-glow-btn rounded-md border border-white/25 bg-slate-900/90 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-800">
              Dashboard
            </Link>
          </div>
          <p className="relative z-10 mt-12 text-xs uppercase tracking-[0.2em] text-slate-400/70">
            Scroll for more
          </p>
        </section>

        <section className="pb-24">
          <h2 className="text-4xl font-bold text-white sm:text-5xl">
            Make ideas sound real fast
          </h2>
          <p className="mt-4 max-w-3xl text-lg text-slate-200/85 sm:text-xl">
            Whether you are sketching a hook or finishing a full idea, Melodica keeps
            you in flow with a clean editor, smooth playback, and fast iteration.
          </p>

          <div className="mt-10 space-y-6 text-base text-slate-100/90 sm:text-lg">
            <div className="max-w-2xl px-1 py-1">
              Compose, arrange, and preview without breaking your creative momentum.
            </div>
            <div className="max-w-2xl px-1 py-1 md:ml-20 lg:ml-32">
              Test ideas instantly with responsive playback and intuitive controls.
            </div>
            <div className="max-w-2xl px-1 py-1 md:ml-8 lg:ml-16">
              Export polished audio when your track is ready to share.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
