const C_MAJOR = ["B", "A", "G", "F", "E", "D", "C"];

export function getPitches(
  scale: "C_MAJOR",
  octaves: number,
  startOctave = 4
): string[] {
  const names = C_MAJOR; // 7 notes per octave (no repeated C)
  const out: string[] = [];

  for (let o = 0; o < octaves; o++) {
    const oct = startOctave - o;
    for (const name of names) {
      out.push(`${name}${oct}`);
    }
  }

  // add the final bottom C (one octave below the last block)
  out.push(`B${startOctave - octaves}`);

  return out;
}