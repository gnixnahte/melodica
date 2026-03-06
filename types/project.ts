import type { KeyRoot, ScaleFamily } from "@/lib/pitches";

export type DrumType = "kick" | "snare" | "hat" | "tom";
export type DrumVariant = 0 | 1 | 2;

export type DrumHit = {
  id: string;
  drum: DrumType;
  variant: DrumVariant;   // ✅ new
  step: number;
  velocity?: number;
};

export type DrumTrack = {
  id: string;
  drum: DrumType;
  variant: DrumVariant;   // ✅ new
  hits: DrumHit[];
};

export type NoteEvent = {
  id: string;
  pitch: string;
  startBeat: number;
  durationBeats: number;
  velocity?: number;
};

export type ProjectSettings = {
  masterVolume: number;
  reverbWet: number;
  reverbDecay: number;
};

export type Project = {
  id: string;
  name: string;
  bpm: number;
  bars: number;

  drumTracks: DrumTrack[];
  keyRoot: KeyRoot;          // e.g. "C", "Eb", "F#", "Bb"
  scaleFamily: ScaleFamily;  // "MAJOR" | "MINOR"
  lowOctave: number;         // e.g. 3
  highOctave: number;        // e.g. 5

  notes: NoteEvent[];
  settings: ProjectSettings;
  updatedAt: number;
};