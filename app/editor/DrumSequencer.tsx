"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/types/project";
import { CELL_W, DRUM_STEPS_PER_BAR, DRUM_STEPS_PER_BEAT } from "./constants";

const DRUM_CELL_W = CELL_W / 2;
const DRUM_TYPES = ["kick", "snare", "hat", "tom"] as const;
const VARIANTS = [0, 1, 2] as const;
type DrumType = (typeof DRUM_TYPES)[number];
type DrumVariant = (typeof VARIANTS)[number];

function formatDrumLabel(
  drum: DrumType,
  variant: DrumVariant
) {
  return `${drum[0].toUpperCase()}${drum.slice(1)} ${variant + 1}`;
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drumMenuRef = useRef<HTMLDivElement | null>(null);

  const setTrackSound = (
    prev: Project,
    trackId: string,
    drum: DrumType,
    variant: DrumVariant,
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
    <div
      ref={containerRef}
      className="relative mx-4 mb-2 shrink-0 rounded-2xl border border-white/60 bg-white/50 p-1.5 shadow-xl shadow-slate-300/15 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/35 dark:shadow-black/20"
    >
      <div className="mb-1.5 text-sm font-medium">Drums</div>
      <div className="flex gap-2">
        <div className="w-14">
          {project.drumTracks.map((track) => (
            <button
              key={track.id}
              className="h-[22px] w-full truncate rounded-md border border-white/65 bg-white/40 px-1 text-[10px] text-slate-800 backdrop-blur-md transition-all duration-200 hover:bg-white/55 hover:shadow-[0_0_12px_rgba(255,255,255,0.7)] dark:border-white/25 dark:bg-zinc-700/35 dark:text-slate-100 dark:hover:bg-zinc-700/55 dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.35)]"
              type="button"
              onDoubleClick={(e) => {
                if (!containerRef.current) return;
                const menuWidth = 210;
                const rect = e.currentTarget.getBoundingClientRect();
                const containerRect = containerRef.current.getBoundingClientRect();
                const buttonBottom = rect.bottom - containerRect.top;
                const x = Math.max(
                  8,
                  Math.min(
                    rect.right - containerRect.left + 8,
                    containerRect.width - menuWidth - 8
                  )
                );
                // Anchor to button bottom; actual bottom alignment uses CSS transform.
                const y = Math.max(8, buttonBottom);
                setDrumMenu({ trackId: track.id, x, y });
              }}
              title="Double-click for lane options"
            >
              {formatDrumLabel(track.drum, track.variant)}
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
          <div style={{ width: gridBeats * CELL_W }}>
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
                        className={`h-[23px] transition-colors border-t-[1.5px] border-b-[1.5px] border-neutral-400/80 dark:border-zinc-600/80 ${
                          hit ? "bg-emerald-500 hover:bg-emerald-600" : ""
                        } ${
                          !hit
                            ? isAltBar
                              ? "bg-neutral-200 dark:bg-zinc-900 hover:bg-neutral-300 dark:hover:bg-zinc-800"
                              : "bg-white dark:bg-zinc-950 hover:bg-neutral-100 dark:hover:bg-zinc-900"
                            : ""
                        }`}
                        style={{
                          width: DRUM_CELL_W,
                          borderLeft: isQuarterStart
                            ? "2px solid rgba(120,120,120,0.62)"
                            : "1.5px solid rgba(120,120,120,0.42)",
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
      <div className="mt-1.5 flex gap-2">
        <div className="w-14 shrink-0" />
        <button
          type="button"
          className="h-7 w-full rounded-lg border border-white/65 bg-white/45 text-lg font-semibold text-slate-700 backdrop-blur-md transition-all duration-200 hover:bg-white/60 hover:shadow-[0_0_18px_rgba(255,255,255,0.72)] dark:border-white/20 dark:bg-zinc-700/40 dark:text-slate-100 dark:hover:bg-zinc-700/60 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
          onClick={() =>
            setProject((p) => ({
              ...p,
              drumTracks: [
                ...p.drumTracks,
                { id: crypto.randomUUID(), drum: "kick", variant: 0, hits: [] },
              ],
              updatedAt: Date.now(),
            }))
          }
          title="Add one lane"
        >
          +
        </button>
      </div>
      {drumMenu && selectedTrack && (
        <div
          ref={drumMenuRef}
          className="absolute z-[80] w-52 -translate-y-full rounded-xl border border-white/60 bg-white/50 p-2 shadow-2xl shadow-slate-400/25 backdrop-blur-xl dark:border-white/15 dark:bg-zinc-900/55 dark:shadow-black/30"
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
                        : "border-white/60 bg-white/40 text-slate-800 backdrop-blur-md hover:bg-white/55 hover:shadow-[0_0_12px_rgba(255,255,255,0.7)] dark:border-white/20 dark:bg-zinc-800/45 dark:text-slate-100 dark:hover:bg-zinc-700/65 dark:hover:shadow-[0_0_12px_rgba(255,255,255,0.35)]"
                    }`}
                    onClick={() => {
                      onPreviewDrum(drum, variant, 0.9);
                      setProject((p) => setTrackSound(p, selectedTrack.id, drum, variant, Date.now()));
                    }}
                  >
                    {formatDrumLabel(drum, variant)}
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            className="delete-glow-btn w-full rounded-md border border-red-300 bg-red-500/90 px-2 py-1.5 text-left text-xs font-semibold text-white transition-all duration-200 hover:bg-red-600"
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
