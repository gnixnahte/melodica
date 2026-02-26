/**
 * Ordered pitch names for piano roll rows (low to high).
 * C_MAJOR: C D E F G A B per octave.
 */
const C_MAJOR = ["C", "D", "E", "F", "G", "A", "B"];

export function getPitches(
  scale: "C_MAJOR",
  octaves: number,
  startOctave = 3
): string[] {
  const names = scale === "C_MAJOR" ? C_MAJOR : C_MAJOR;
  const out: string[] = [];
  for (let o = 0; o < octaves; o++) {
    const oct = startOctave + o;
    for (const name of names) {
      out.push(`${name}${oct}`);
    }
  }
  return out;
}
