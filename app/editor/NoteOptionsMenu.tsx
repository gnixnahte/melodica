"use client";

import type { NoteEvent, MelodyInstrument } from "@/types/project";
import { normalizeInstrument } from "@/lib/editorUtils";
import { MELODY_INSTRUMENTS } from "./constants";

export interface NoteOptionsMenuProps {
  note: NoteEvent;
  position: { x: number; y: number };
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onUpdate: (noteId: string, patch: Partial<NoteEvent>) => void;
  onDelete: (noteId: string) => void;
  onPreviewNote: (
    pitch: string,
    velocity: number,
    instrument: MelodyInstrument
  ) => void;
}

export function NoteOptionsMenu({
  note,
  position,
  menuRef,
  onClose,
  onUpdate,
  onDelete,
  onPreviewNote,
}: NoteOptionsMenuProps) {
  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-60 rounded-lg border border-white/70 bg-white/75 p-3 shadow-2xl shadow-slate-400/25 backdrop-blur-xl dark:border-white/15 dark:bg-zinc-900/60 dark:shadow-black/20"
      style={{ left: position.x, top: position.y }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Note Options
      </div>
      <div className="mb-2 text-xs text-neutral-500">
        {note.pitch} at beat {note.startBeat}
      </div>
      <label className="mb-2 block text-xs font-medium">
        Instrument
        <select
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={normalizeInstrument(note.instrument)}
          onChange={(e) => {
            const instrument = e.target.value as MelodyInstrument;
            onUpdate(note.id, { instrument });
            onPreviewNote(note.pitch, note.velocity ?? 0.8, instrument);
          }}
        >
          {MELODY_INSTRUMENTS.map((instrument) => (
            <option key={instrument} value={instrument}>
              {instrument}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-2 block text-xs font-medium">
        Duration
        <select
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={note.durationBeats}
          onChange={(e) => {
            onUpdate(note.id, { durationBeats: Number(e.target.value) });
          }}
        >
          <option value={1}>1 step</option>
          <option value={2}>2 steps</option>
          <option value={4}>4 steps</option>
          <option value={8}>8 steps</option>
        </select>
      </label>
      <label className="mb-3 block text-xs font-medium">
        Velocity
        <select
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={note.velocity ?? 0.8}
          onChange={(e) => {
            const velocity = Number(e.target.value);
            onUpdate(note.id, { velocity });
            onPreviewNote(
              note.pitch,
              velocity,
              normalizeInstrument(note.instrument)
            );
          }}
        >
          <option value={0.4}>0.4</option>
          <option value={0.6}>0.6</option>
          <option value={0.8}>0.8</option>
          <option value={1}>1.0</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs transition-all duration-200 hover:shadow-[0_0_14px_rgba(255,255,255,0.7)]"
          onClick={onClose}
        >
          Close
        </button>
        <button
          type="button"
          className="delete-glow-btn rounded bg-red-600 px-2 py-1 text-xs text-white transition-all duration-200 hover:bg-red-500"
          onClick={() => {
            onDelete(note.id);
            onClose();
          }}
        >
          Delete Note
        </button>
      </div>
    </div>
  );
}
