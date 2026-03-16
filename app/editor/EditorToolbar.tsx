"use client";

import * as Tone from "tone";
import { getPitches } from "@/lib/pitches";
import type { KeyRoot, ScaleFamily } from "@/lib/pitches";
import type { Project, MelodyInstrument } from "@/types/project";
import { NOTE_STEPS_PER_BAR, DRUM_STEPS_PER_BAR, MELODY_INSTRUMENTS } from "./constants";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type SettingDialProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (value: number) => void;
};

function SettingDial({
  label,
  value,
  min,
  max,
  step,
  decimals = 2,
  onChange,
}: SettingDialProps) {
  const percent = (value - min) / (max - min || 1);
  const angle = -135 + percent * 270;
  const display = value.toFixed(decimals);

  const onMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startValue = value;
    const range = max - min;
    const sensitivity = 180;
    const onMove = (moveEvent: MouseEvent) => {
      const dy = startY - moveEvent.clientY;
      const raw = startValue + (dy / sensitivity) * range;
      const stepped = Math.round(raw / step) * step;
      const rounded = Number(stepped.toFixed(6));
      onChange(clamp(rounded, min, max));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onMouseDown={onMouseDown}
        className="relative h-14 w-14 rounded-full border border-white/70 bg-white/70 shadow-sm transition-all duration-150 hover:shadow-[0_0_16px_rgba(255,255,255,0.72)] dark:border-white/15 dark:bg-slate-700/50 dark:hover:shadow-[0_0_16px_rgba(255,255,255,0.35)]"
        title={`${label}: ${display}`}
      >
        <div className="absolute inset-1 rounded-full bg-slate-200/85 dark:bg-slate-800/85" />
        <div
          className="absolute left-1/2 top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-[95%] rounded-full bg-slate-700 dark:bg-slate-100"
          style={{ transform: `translate(-50%, -95%) rotate(${angle}deg)`, transformOrigin: "50% 170%" }}
        />
      </button>
      <div className="text-[11px] font-medium leading-none">{label}</div>
      <div className="text-[10px] opacity-80 leading-none">{display}</div>
    </div>
  );
}

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
  notesMuted: boolean;
  setNotesMuted: React.Dispatch<React.SetStateAction<boolean>>;
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
  notesMuted,
  setNotesMuted,
}: EditorToolbarProps) {
  return (
    <div className="mx-4 mt-4 flex flex-row flex-wrap items-center justify-evenly gap-x-4 gap-y-2 rounded-2xl border border-white/60 bg-white/50 p-4 text-sm shadow-xl shadow-slate-300/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/35 dark:shadow-black/20">
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
                audioTracks: p.audioTracks.map((track) => ({
                  ...track,
                  clips: track.clips
                    .filter((clip) => clip.startStep16 < maxStep16)
                    .map((clip) => ({
                      ...clip,
                      durationStep16: Math.max(
                        1,
                        Math.min(clip.durationStep16, maxStep16 - clip.startStep16)
                      ),
                    })),
                })),
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
          className="w-fit rounded-md border border-slate-300/70 bg-white/70 px-2 py-0.5 text-sm dark:border-white/15 dark:bg-slate-800/60"
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

      <div className="flex items-end gap-3">
        <SettingDial
          label="Master"
          value={project.settings.masterVolume}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          onChange={(next) =>
            setProject((p) => ({
              ...p,
              settings: { ...p.settings, masterVolume: next },
              updatedAt: Date.now(),
            }))
          }
        />
        <SettingDial
          label="Wet"
          value={project.settings.reverbWet}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
          onChange={(next) =>
            setProject((p) => ({
              ...p,
              settings: { ...p.settings, reverbWet: next },
              updatedAt: Date.now(),
            }))
          }
        />
        <SettingDial
          label="Decay"
          value={project.settings.reverbDecay}
          min={0.2}
          max={10}
          step={0.1}
          decimals={1}
          onChange={(next) =>
            setProject((p) => ({
              ...p,
              settings: { ...p.settings, reverbDecay: next },
              updatedAt: Date.now(),
            }))
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`rounded-full px-6 py-3 text-sm font-medium text-white shadow-lg transition-all hover:shadow-[0_0_18px_rgba(255,255,255,0.72)] ${
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
        <button
          type="button"
          onClick={() => setNotesMuted((prev) => !prev)}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
            notesMuted
              ? "border border-amber-300/80 bg-amber-500/85 text-white hover:bg-amber-500 hover:shadow-[0_0_18px_rgba(255,255,255,0.72)]"
              : "border border-white/70 bg-white/70 text-slate-800 hover:bg-white hover:shadow-[0_0_18px_rgba(255,255,255,0.72)] dark:border-white/15 dark:bg-slate-700/50 dark:text-slate-100 dark:hover:bg-slate-700/80 dark:hover:shadow-[0_0_18px_rgba(255,255,255,0.35)]"
          }`}
        >
          {notesMuted ? "Unmute Notes" : "Mute Notes"}
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
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 hover:shadow-[0_0_16px_rgba(255,255,255,0.7)] ${
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
