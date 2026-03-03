// lib/pitches.ts
import * as Tone from "tone";

export type ScaleFamily = "MAJOR" | "MINOR";

// Major keys (15)
export type MajorKey =
  | "Cb" | "Gb" | "Db" | "Ab" | "Eb" | "Bb" | "F"
  | "C"  | "G"  | "D"  | "A"  | "E"  | "B"  | "F#" | "C#";

// Natural minor keys (15)
export type MinorKey =
  | "Ab" | "Eb" | "Bb" | "F"  | "C"  | "G"  | "D"
  | "A"  | "E"  | "B"  | "F#" | "C#" | "G#" | "D#" | "A#";

export type KeyRoot = MajorKey | MinorKey;

export const ALL_MAJOR_KEYS: MajorKey[] = [
  "Cb","Gb","Db","Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#",
];

export const ALL_MINOR_KEYS: MinorKey[] = [
  "Ab","Eb","Bb","F","C","G","D","A","E","B","F#","C#","G#","D#","A#",
];

// semitone intervals from root
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NAT_MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

// letter order for correct spellings
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
type Letter = (typeof LETTERS)[number];

const LETTER_TO_PC: Record<Letter, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function mod12(n: number) {
  return ((n % 12) + 12) % 12;
}

function parseRoot(root: string): { letter: Letter; acc: number } {
  const letter = root[0] as Letter;
  if (!LETTERS.includes(letter)) throw new Error(`Invalid root: ${root}`);

  let acc = 0;
  for (const ch of root.slice(1)) {
    if (ch === "#") acc += 1;
    else if (ch === "b") acc -= 1;
    else throw new Error(`Invalid accidental in root: ${root}`);
  }
  return { letter, acc };
}

function rotateLetters(start: Letter): Letter[] {
  const idx = LETTERS.indexOf(start);
  return [...LETTERS.slice(idx), ...LETTERS.slice(0, idx)];
}

function accidentalString(delta: number): string {
  if (delta === 0) return "";
  if (delta > 0) return "#".repeat(delta);
  return "b".repeat(-delta);
}

function signedDelta(targetPc: number, naturalPc: number): number {
  const d = mod12(targetPc - naturalPc); // 0..11
  if (d === 0) return 0;
  if (d <= 6) return d;
  return d - 12;
}

/**
 * Returns 7 note names (no octave), with correct spellings for the key.
 * Example: buildScale("D", "MAJOR") => ["D","E","F#","G","A","B","C#"]
 */
export function buildScale(root: KeyRoot, family: ScaleFamily): string[] {
  const { letter: rootLetter, acc: rootAcc } = parseRoot(root);
  const intervals = family === "MAJOR" ? MAJOR_INTERVALS : NAT_MINOR_INTERVALS;

  const rootPc = mod12(LETTER_TO_PC[rootLetter] + rootAcc);
  const diatonicLetters = rotateLetters(rootLetter);

  const out: string[] = [];
  for (let degree = 0; degree < 7; degree++) {
    const targetPc = mod12(rootPc + intervals[degree]);
    const letter = diatonicLetters[degree];
    const naturalPc = LETTER_TO_PC[letter];
    const delta = signedDelta(targetPc, naturalPc);

    if (Math.abs(delta) > 2) {
      throw new Error(`Unexpected spelling for ${root} ${family}`);
    }

    out.push(`${letter}${accidentalString(delta)}`);
  }
  return out;
}

/**
 * Returns pitches WITH octaves, sorted high->low using MIDI (prevents octave bugs).
 */
export function getPitches(
  root: KeyRoot,
  family: ScaleFamily,
  lowOctave: number,
  highOctave: number
): string[] {
  if (lowOctave > highOctave) {
    throw new Error("lowOctave must be <= highOctave");
  }

  const scale = buildScale(root, family);
  const pitches: { note: string; midi: number }[] = [];

  for (let oct = lowOctave; oct <= highOctave; oct++) {
    for (const n of scale) {
      const note = `${n}${oct}`;
      const midi = Tone.Frequency(note).toMidi();
      pitches.push({ note, midi });
    }
  }

  pitches.sort((a, b) => b.midi - a.midi);

  const seen = new Set<number>();
  return pitches
    .filter((p) => (seen.has(p.midi) ? false : (seen.add(p.midi), true)))
    .map((p) => p.note);
}