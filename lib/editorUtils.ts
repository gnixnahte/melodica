import type { NoteEvent, MelodyInstrument } from "@/types/project";
import { MELODY_INSTRUMENTS } from "@/app/editor/constants";

export function noteOccupies(
  note: NoteEvent,
  pitch: string,
  beat: number
): boolean {
  return (
    note.pitch === pitch &&
    note.startBeat <= beat &&
    beat < note.startBeat + note.durationBeats
  );
}

export function hasNoteAt(
  notes: NoteEvent[],
  pitch: string,
  beat: number
): boolean {
  return notes.some((n) => noteOccupies(n, pitch, beat));
}

export function getNoteOccupying(
  notes: NoteEvent[],
  pitch: string,
  beat: number
): NoteEvent | undefined {
  return notes.find((n) => noteOccupies(n, pitch, beat));
}

export function normalizeInstrument(
  instrument?: MelodyInstrument
): MelodyInstrument {
  if (!instrument) return "Triangle";
  return MELODY_INSTRUMENTS.includes(instrument) ? instrument : "Triangle";
}
