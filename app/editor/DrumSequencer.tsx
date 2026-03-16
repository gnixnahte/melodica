"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/types/project";
import { CELL_W, DRUM_STEPS_PER_BAR, DRUM_STEPS_PER_BEAT } from "./constants";

const DRUM_CELL_W = CELL_W / 2;
const DRUM_TYPES = ["kick", "snare", "hat", "tom"] as const;
const VARIANTS = [0, 1, 2] as const;

export interface DrumSequencerProps {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  drumScrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  currentStep16: number;
  drumWindow: { start: number; end: number };
  gridBeats: number;
  drumGridBeats: number;
  onPreviewDrum: (
    drum: "kick" | "snare" | "hat" | "tom",
    variant: number,
    velocity: number
  ) => void;
}

export function DrumSequencer({
  project,
  setProject,
  drumScrollRef,
  onScroll,
  currentStep16,
  drumWindow,
  gridBeats,
  drumGridBeats,
  onPreviewDrum,
}: DrumSequencerProps) {
  type DrumMenuState = {
    trackId: string;
    x: number;
    y: number;
  };
  const [drumMenu, setDrumMenu] = useState<DrumMenuState | null>(null);
  const drumMenuRef = useRef<HTMLDivElement | null>(null);

  const setTrackSound = (
    prev: Project,
    trackId: string,
    drum: (typeof DRUM_TYPES)[number],
    variant: number,
    updatedAt: number
  ) => ({
    ...prev,
    drumTracks: prev.drumTracks.map((track) => {
      if (track.id !== trackId) return track;
      return {
        ...track,
        drum,
        variant,
        hits: track.hits.map((hit) => ({ ...hit, drum, variant })),
      };
    }),
    updatedAt,
  });

  const selectedTrack = drumMenu
    ? project.drumTracks.find((track) => track.id === drumMenu.trackId) ?? null
    : null;

  useEffect(() => {
    if (!drumMenu) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!drumMenuRef.current) return;
      if (drumMenuRef.current.contains(event.target as Node)) return;
      setDrumMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrumMenu(null);
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drumMenu]);

  return (
    <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-white/60 bg-white/50 p-2 shadow-xl shadow-slate-300/15 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/35 dark:shadow-black/20">
      <div className="mb-2 text-sm font-medium">Drums</div>

      <div className="flex gap-2">
        <div className="w-14 shrink-0 space-y-2">
          {project.drumTracks.map((track) => (
            <button
              key={track.id}
              className="h-6 w-full truncate rounded-md border border-slate-300/80 bg-white/70 px-1 text-[10px] text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-[0_0_12px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80 dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.35)]"
              type="button"
              onDoubleClick={(e) => {
                const menuWidth = 210;
                const menuHeight = 240;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.min(rect.right + 8, window.innerWidth - menuWidth - 12);
                const y = Math.max(
                  12,
                  Math.min(rect.top - 4, window.innerHeight - menuHeight - 12)
                );
                setDrumMenu({ trackId: track.id, x, y });
              }}
              title="Double-click for lane options"
            >
              {track.drum}
            </button>
          ))}
        </div>

        <div
          ref={drumScrollRef}
          onScroll={onScroll}
          className="relative overflow-x-auto"
          style={{ width: "100%" }}
        >
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-yellow-400 pointer-events-none z-20"
            style={{ left: currentStep16 * DRUM_CELL_W }}
          />
          <div className="space-y-2" style={{ width: gridBeats * CELL_W }}>
            {project.drumTracks.map((track) => (
              <div key={track.id} className="flex">
                <div
                  aria-hidden="true"
                  className="shrink-0"
                  style={{ width: drumWindow.start * DRUM_CELL_W }}
                />
                {Array.from(
                  { length: drumWindow.end - drumWindow.start },
                  (_, localIndex) => {
                    const step = drumWindow.start + localIndex;
                    const hit = track.hits.find((h) => h.step === step);
                    const barIndex = Math.floor(step / DRUM_STEPS_PER_BAR);
                    const isAltBar = barIndex % 2 === 1;
                    const isQuarterStart =
                      step % DRUM_STEPS_PER_BEAT === 0;
                    return (
                      <button
                        key={`${track.id}-${step}`}
                        className={`h-6 transition-colors border-t border-b border-neutral-300 dark:border-neutral-700 ${
                          hit ? "bg-emerald-500 hover:bg-emerald-600" : ""
                        } ${
                          !hit
                            ? isAltBar
                              ? "bg-neutral-200 dark:bg-neutral-900 hover:bg-neutral-300 dark:hover:bg-neutral-800"
                              : "bg-white dark:bg-neutral-950 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                            : ""
                        }`}
                        style={{
                          width: DRUM_CELL_W,
                          borderLeft: isQuarterStart
                            ? "2px solid rgba(120,120,120,0.6)"
                            : "1px solid rgba(120,120,120,0.25)",
                        }}
                        onClick={() => {
                          setProject((p) => ({
                            ...p,
                            drumTracks: p.drumTracks.map((t) => {
                              if (t.id !== track.id) return t;
                              const existing = t.hits.find(
                                (h) => h.step === step
                              );
                              if (existing) {
                                return {
                                  ...t,
                                  hits: t.hits.filter(
                                    (h) => h.id !== existing.id
                                  ),
                                };
                              }
                              onPreviewDrum(t.drum, t.variant, 0.9);
                              return {
                                ...t,
                                hits: [
                                  ...t.hits,
                                  {
                                    id: crypto.randomUUID(),
                                    drum: t.drum,
                                    step,
                                    velocity: 0.9,
                                    variant: t.variant,
                                  },
                                ],
                              };
                            }),
                            updatedAt: Date.now(),
                          }));
                        }}
                      />
                    );
                  }
                )}
                <div
                  aria-hidden="true"
                  className="shrink-0"
                  style={{
                    width: (drumGridBeats - drumWindow.end) * DRUM_CELL_W,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <div className="w-14 shrink-0" />
        <button
          type="button"
          className="h-8 w-full rounded-lg border border-white/70 bg-white/70 text-lg font-semibold text-slate-700 transition-all duration-200 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.72)] dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
          onClick={() =>
            setProject((p) => ({
              ...p,
              bars: Math.min(256, p.bars + 1),
              updatedAt: Date.now(),
            }))
          }
          title="Add one bar"
        >
          +
        </button>
      </div>
      {drumMenu && selectedTrack && (
        <div
          ref={drumMenuRef}
          className="fixed z-[80] w-52 rounded-xl border border-white/70 bg-white/90 p-2 shadow-2xl shadow-slate-400/25 backdrop-blur-xl dark:border-white/15 dark:bg-slate-900/90 dark:shadow-black/30"
          style={{ left: drumMenu.x, top: drumMenu.y }}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Drum Lane
          </div>
          <div className="mb-2 max-h-44 overflow-auto space-y-1">
            {DRUM_TYPES.flatMap((drum) =>
              VARIANTS.map((variant) => {
                const isSelected = selectedTrack.drum === drum && selectedTrack.variant === variant;
                return (
                  <button
                    key={`${drum}-${variant}`}
                    type="button"
                    className={`w-full rounded-md border px-2 py-1 text-left text-xs transition-all duration-150 ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-700 dark:text-emerald-200"
                        : "border-slate-300/80 bg-white/75 text-slate-800 hover:bg-white hover:shadow-[0_0_12px_rgba(255,255,255,0.7)] dark:border-white/15 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/80 dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.35)]"
                    }`}
                    onClick={() => {
                      setProject((p) => setTrackSound(p, selectedTrack.id, drum, variant, Date.now()));
                      setDrumMenu(null);
                    }}
                  >
                    {`${drum[0].toUpperCase()}${drum.slice(1)} ${variant + 1}`}
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            className="w-full rounded-md border border-red-300 bg-red-500/90 px-2 py-1.5 text-left text-xs font-semibold text-white transition-all duration-200 hover:bg-red-600 hover:shadow-[0_0_16px_rgba(255,120,120,0.75)]"
            onClick={() => {
              setProject((p) => ({
                ...p,
                drumTracks:
                  p.drumTracks.length <= 1
                    ? p.drumTracks.map((t) => (t.id === selectedTrack.id ? { ...t, hits: [] } : t))
                    : p.drumTracks.filter((t) => t.id !== selectedTrack.id),
                updatedAt: Date.now(),
              }));
              setDrumMenu(null);
            }}
          >
            Delete Lane
          </button>
        </div>
      )}
    </div>
  );
}
