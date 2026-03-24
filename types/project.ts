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
  instrument?: MelodyInstrument;
};

export type MelodyInstrument =
  | "Triangle"
  | "Saw"
  | "Square"
  | "FM Bell"
  | "AM Pad"
  | "Duo Lead";

export type SfxPreset =
  | "Clean"
  | "Lo-Fi"
  | "Telephone"
  | "Crunch";

export type AudioClip = {
  id: string;
  startStep16: number;
  durationStep16: number;
  url: string;
  gain?: number;
};

export type AudioTrack = {
  id: string;
  name: string;
  clips: AudioClip[];
};

export type ProjectSettings = {
  masterVolume: number;
  reverbWet: number;
  reverbDecay: number;
  drumVolume: number;
  drumReverbWet: number;
  drumReverbDecay: number;
  sfxPreset: SfxPreset;
  distortionAmount: number;
  albumCoverUrl?: string;
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
  audioTracks: AudioTrack[];
  settings: ProjectSettings;
  updatedAt: number;
};
