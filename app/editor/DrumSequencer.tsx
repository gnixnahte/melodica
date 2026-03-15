"use client";

import type { Project } from "@/types/project";
import { CELL_W, DRUM_STEPS_PER_BAR, DRUM_STEPS_PER_BEAT } from "./constants";

const DRUM_CELL_W = CELL_W / 2;

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
  return (
    <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-white/60 bg-white/50 p-2 shadow-xl shadow-slate-300/15 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/35 dark:shadow-black/20">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Drums</div>
        <button
          className="rounded-md border border-slate-300/80 bg-white/70 px-3 py-1 text-sm text-slate-800 hover:bg-white dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80"
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
        >
          + Add lane
        </button>
      </div>

      <div className="flex gap-2">
        <div className="w-14 shrink-0 space-y-2">
          {project.drumTracks.map((track) => (
            <button
              key={track.id}
              className="h-6 w-full rounded-md border border-slate-300/80 bg-white/70 text-xs text-slate-800 dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100"
              type="button"
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
    </div>
  );
}
