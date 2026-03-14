import type { MelodyInstrument } from "@/types/project";

export const NOTE_STEPS_PER_BAR = 8;
export const DRUM_STEPS_PER_BAR = 16;
export const NOTE_RENDER_BUFFER_COLS = 32;
export const DRUM_RENDER_BUFFER_STEPS = 64;

export const CELL_W = 25;
export const CELL_H = 45;
export const DRUM_STEPS_PER_QUARTER = 4;
export const DRUM_STEPS_PER_BEAT = 4;
export const NOTE_STEPS_PER_QUARTER = 2;
export const NOTE_RESIZE_HANDLE_PX = 6;

export const MELODY_INSTRUMENTS = [
  "Triangle",
  "Saw",
  "Square",
  "FM Bell",
  "AM Pad",
  "Duo Lead",
] as const;

export const NOTE_INSTRUMENT_COLORS: Record<MelodyInstrument, string> = {
  Triangle: "bg-emerald-500 hover:bg-emerald-600",
  Saw: "bg-cyan-500 hover:bg-cyan-600",
  Square: "bg-sky-500 hover:bg-sky-600",
  "FM Bell": "bg-amber-500 hover:bg-amber-600",
  "AM Pad": "bg-fuchsia-500 hover:bg-fuchsia-600",
  "Duo Lead": "bg-rose-500 hover:bg-rose-600",
};
