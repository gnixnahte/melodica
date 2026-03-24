"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
        className="landing-hero-art pointer-events-none absolute right-[calc(-10rem-20px)] top-0 hidden h-screen w-[calc(56vw+15px)] min-w-[775px] max-w-[1215px] lg:block xl:right-[calc(-12rem-20px)]"
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
          <h1 className="landing-glass-title relative z-10 inline-block text-7xl font-black tracking-tight sm:text-8xl md:text-9xl">
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

        <section className="flex min-h-[95vh] flex-col justify-center border-t border-white/12 py-28 sm:py-36">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300/70">01 / Build the spark</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white sm:text-5xl md:text-6xl">
            Go from blank page to your first playable idea in minutes
          </h2>
          <div className="mt-16 space-y-14">
            <div className="max-w-3xl space-y-4">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Instant sketch mode</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Lay down notes right away with no setup friction. The editor stays lightweight
                so you can follow momentum while ideas are fresh.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-24">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Hear changes immediately</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Every move gives instant playback feedback, making experimentation feel fast
                and musical instead of technical.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-12">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Stay in creative flow</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Core controls are right where you expect them, so drafting, nudging, and
                refining sections feels natural from the first bar.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[95vh] flex-col justify-center border-t border-white/12 py-28 sm:py-36">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300/70">02 / Shape the groove</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white sm:text-5xl md:text-6xl">
            Expand rough loops into sections that feel arranged and intentional
          </h2>
          <div className="mt-16 space-y-16">
            <div className="max-w-3xl space-y-4 md:ml-32 lg:ml-44">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Section-by-section control</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Build intros, drops, and bridges with confident structure. You can adjust
                timing and note density until each part locks into place.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-48 lg:ml-64">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Detail without clutter</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Keep your focus on musical decisions, not busywork. The interface gives
                depth when you need it and stays out of the way when you do not.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-40 lg:ml-56">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Confident iteration</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Try variations quickly, compare ideas, and keep what works. It is designed
                for real creative iteration, not one-pass editing.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[95vh] flex-col justify-center border-y border-white/12 py-28 sm:py-36">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300/70">03 / Finish and share</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-bold text-white sm:text-5xl md:text-6xl">
            Polish your track and export with a clean, ready-to-share result
          </h2>
          <div className="mt-16 space-y-16 pb-8">
            <div className="max-w-3xl space-y-4">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Refine the final pass</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Tighten note placement, rebalance sections, and smooth transitions until
                the full progression feels cohesive from start to finish.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-24">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Export without friction</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                When the idea is ready, render it cleanly and move on to feedback, vocals,
                or your next production step without jumping through extra setup.
              </p>
            </div>
            <div className="max-w-3xl space-y-4 md:ml-8">
              <h3 className="text-2xl font-semibold text-white sm:text-3xl">Build your momentum</h3>
              <p className="text-lg leading-relaxed text-slate-100/85">
                Melodica is built to keep you shipping ideas. Start fast, keep shaping,
                and finish more tracks with less drag on the process.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
