"use client";

import * as Tone from "tone";
import { getPitches } from "@/lib/pitches";
import type { KeyRoot, ScaleFamily } from "@/lib/pitches";
import type { Project, MelodyInstrument } from "@/types/project";
import { NOTE_STEPS_PER_BAR, DRUM_STEPS_PER_BAR, MELODY_INSTRUMENTS } from "./constants";

export interface EditorToolbarProps {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  bpmText: string;
  setBpmText: React.Dispatch<React.SetStateAction<string>>;
  barsText: string;
  setBarsText: React.Dispatch<React.SetStateAction<string>>;
  lowOctaveText: string;
  setLowOctaveText: React.Dispatch<React.SetStateAction<string>>;
  highOctaveText: string;
  setHighOctaveText: React.Dispatch<React.SetStateAction<string>>;
  keys: KeyRoot[];
  handleKeyChange: (newKey: KeyRoot) => void;
  handleScaleFamilyChange: (newFamily: ScaleFamily) => void;
  defaultInstrument: MelodyInstrument;
  setDefaultInstrument: React.Dispatch<React.SetStateAction<MelodyInstrument>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  metronomeOn: boolean;
  setMetronomeOn: React.Dispatch<React.SetStateAction<boolean>>;
}

export function EditorToolbar({
  project,
  setProject,
  bpmText,
  setBpmText,
  barsText,
  setBarsText,
  lowOctaveText,
  setLowOctaveText,
  highOctaveText,
  setHighOctaveText,
  keys,
  handleKeyChange,
  handleScaleFamilyChange,
  defaultInstrument,
  setDefaultInstrument,
  isPlaying,
  setIsPlaying,
  metronomeOn,
  setMetronomeOn,
}: EditorToolbarProps) {
  return (
    <div className="mx-4 mt-4 p-4 rounded-xl bg-white/70 dark:bg-neutral-900/70 backdrop-blur-md border border-neutral-200/50 dark:border-neutral-700/50 shadow-lg shadow-neutral-200/20 dark:shadow-neutral-950/50 flex flex-row flex-wrap items-center justify-evenly gap-x-4 gap-y-2 text-sm">
      <div>
        <span className="font-md">Name:</span>
        <input
          style={{ textAlign: "left" }}
          type="text"
          value={project.name}
          onChange={(e) =>
            setProject((p) => ({
              ...p,
              name: e.target.value,
              updatedAt: Date.now(),
            }))
          }
          size={project.name.length}
        />
      </div>

      <div>
        <span className="font-medium">BPM:</span>
        <input
          className="w-fit"
          type="text"
          value={bpmText}
          onChange={(e) => setBpmText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const newVal = e.currentTarget.value.trim();
            const parsed = parseInt(newVal, 10);
            if (newVal === "" || Number.isNaN(parsed)) {
              setBpmText(String(project.bpm));
              return;
            }
            const clamped = Math.max(20, Math.min(400, parsed));
            setProject((p) => ({ ...p, bpm: clamped, updatedAt: Date.now() }));
            setBpmText(String(clamped));
            e.currentTarget.blur();
          }}
          size={Math.max(2, bpmText.length)}
        />
      </div>

      <div>
        <span className="font-medium">Bars:</span>
        <input
          className="w-fit"
          type="text"
          value={barsText}
          onChange={(e) => setBarsText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const newVal = e.currentTarget.value.trim();
            const parsed = parseInt(newVal, 10);
            if (newVal === "" || Number.isNaN(parsed)) {
              setBarsText(String(project.bars));
              return;
            }
            const clamped = Math.max(1, Math.min(256, parsed));
            const maxBeat8 = clamped * NOTE_STEPS_PER_BAR;
            const maxStep16 = clamped * DRUM_STEPS_PER_BAR;
            if (clamped < project.bars) {
              const notesToDelete = project.notes.filter(
                (n) => n.startBeat >= maxBeat8
              ).length;
              const hitsToDelete = project.drumTracks
                .flatMap((t) => t.hits)
                .filter((h) => h.step >= maxStep16).length;
              if (notesToDelete + hitsToDelete > 0) {
                const confirmed = window.confirm(
                  `Shrink project to ${clamped} bars?\n\n` +
                    `This will delete ${notesToDelete} note(s) and ${hitsToDelete} drum hit(s) beyond bar ${clamped}.`
                );
                if (!confirmed) {
                  setBarsText(String(project.bars));
                  return;
                }
              }
            }
            setProject((p) => {
              const maxBeat8 = clamped * NOTE_STEPS_PER_BAR;
              const maxStep16 = clamped * DRUM_STEPS_PER_BAR;
              return {
                ...p,
                bars: clamped,
                notes: p.notes.filter((n) => n.startBeat < maxBeat8),
                drumTracks: p.drumTracks.map((t) => ({
                  ...t,
                  hits: t.hits.filter((h) => h.step < maxStep16),
                })),
                updatedAt: Date.now(),
              };
            });
            setBarsText(String(clamped));
            e.currentTarget.blur();
          }}
          onBlur={() => setBarsText(String(project.bars))}
          size={Math.max(1, barsText.length)}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">Scale:</span>
        <select
          className="w-fit rounded-md border px-2 py-0.5 text-sm bg-white dark:bg-neutral-900"
          value={project.scaleFamily}
          onChange={(e) => handleScaleFamilyChange(e.target.value as ScaleFamily)}
        >
          <option value="MAJOR">Major</option>
          <option value="MINOR">Minor</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">Key:</span>
        <select
          value={project.keyRoot}
          onChange={(e) => handleKeyChange(e.target.value as KeyRoot)}
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">Default Instrument:</span>
        <select
          value={defaultInstrument}
          onChange={(e) => {
            const instrument = e.target.value as MelodyInstrument;
            setDefaultInstrument(instrument);
            const applyToAll = window.confirm(
              "Apply this instrument to all existing notes?"
            );
            if (applyToAll) {
              setProject((p) => ({
                ...p,
                notes: p.notes.map((n) => ({ ...n, instrument })),
                updatedAt: Date.now(),
              }));
            }
          }}
        >
          {MELODY_INSTRUMENTS.map((instrument) => (
            <option key={instrument} value={instrument}>
              {instrument}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-medium">Low:</span>
        <input
          type="text"
          className="w-14 rounded-md border px-2 py-0.5 text-sm"
          value={lowOctaveText}
          onChange={(e) => setLowOctaveText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const val = parseInt(e.currentTarget.value.trim(), 10);
            if (Number.isNaN(val)) {
              setLowOctaveText(String(project.lowOctave));
              return;
            }
            const clamped = Math.max(0, Math.min(8, val));
            const nextLow = clamped;
            const nextHigh = Math.max(project.highOctave, clamped);
            const allowedPitches = new Set(
              getPitches(project.keyRoot, project.scaleFamily, nextLow, nextHigh)
            );
            const notesToDelete = project.notes.filter(
              (n) => !allowedPitches.has(n.pitch)
            ).length;
            if (notesToDelete > 0) {
              const confirmed = window.confirm(
                `Change octave range to ${nextLow}-${nextHigh}?\n\n` +
                  `This will delete ${notesToDelete} note(s) outside the new range.`
              );
              if (!confirmed) {
                setLowOctaveText(String(project.lowOctave));
                return;
              }
            }
            setProject((p) => ({
              ...p,
              lowOctave: nextLow,
              highOctave: nextHigh,
              notes: p.notes.filter((n) => allowedPitches.has(n.pitch)),
              updatedAt: Date.now(),
            }));
            setLowOctaveText(String(clamped));
            e.currentTarget.blur();
          }}
          onBlur={() => setLowOctaveText(String(project.lowOctave))}
        />
        <span className="font-medium">High:</span>
        <input
          type="text"
          className="w-14 rounded-md border px-2 py-0.5 text-sm"
          value={highOctaveText}
          onChange={(e) => setHighOctaveText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const val = parseInt(e.currentTarget.value.trim(), 10);
            if (Number.isNaN(val)) {
              setHighOctaveText(String(project.highOctave));
              return;
            }
            const clamped = Math.max(0, Math.min(8, val));
            const nextHigh = clamped;
            const nextLow = Math.min(project.lowOctave, clamped);
            const allowedPitches = new Set(
              getPitches(project.keyRoot, project.scaleFamily, nextLow, nextHigh)
            );
            const notesToDelete = project.notes.filter(
              (n) => !allowedPitches.has(n.pitch)
            ).length;
            if (notesToDelete > 0) {
              const confirmed = window.confirm(
                `Change octave range to ${nextLow}-${nextHigh}?\n\n` +
                  `This will delete ${notesToDelete} note(s) outside the new range.`
              );
              if (!confirmed) {
                setHighOctaveText(String(project.highOctave));
                return;
              }
            }
            setProject((p) => ({
              ...p,
              highOctave: nextHigh,
              lowOctave: nextLow,
              notes: p.notes.filter((n) => allowedPitches.has(n.pitch)),
              updatedAt: Date.now(),
            }));
            setHighOctaveText(String(clamped));
            e.currentTarget.blur();
          }}
          onBlur={() => setHighOctaveText(String(project.highOctave))}
        />
      </div>

      <div>
        <span className="font-medium">Master Volume:</span>{" "}
        {project.settings.masterVolume}
      </div>
      <div>
        <span className="font-medium">Reverb Wet:</span>{" "}
        {project.settings.reverbWet}
      </div>
      <div>
        <span className="font-medium">Reverb Decay:</span>{" "}
        {project.settings.reverbDecay}
      </div>
      <div>
        <span className="font-medium">Notes:</span> {project.notes.length}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg transition-all ${
            isPlaying
              ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
              : "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30"
          }`}
          onClick={async () => {
            await Tone.start();
            setIsPlaying((prev) => !prev);
          }}
          aria-label={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-4 w-4 items-center justify-center text-[12px] leading-none"
                aria-hidden
              >
                ■
              </span>
              Stop
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-4 w-4 items-center justify-center text-[13px] leading-none"
                aria-hidden
              >
                ▶
              </span>
              Play
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-neutral-600 dark:text-neutral-400 text-sm font-medium">
            Metronome
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={metronomeOn}
            onClick={() => setMetronomeOn((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
              metronomeOn
                ? "bg-emerald-500"
                : "bg-neutral-200 dark:bg-neutral-600"
            }`}
          >
            <span
              className={`pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                metronomeOn ? "translate-x-5 -translate-y-1/2" : "translate-x-0 -translate-y-1/2"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
