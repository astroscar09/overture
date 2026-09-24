// Guitar tunings as open-string MIDI numbers.
//
// Order: index 0 is the LOWEST-pitched string (6th / low E), index 5 is the
// highest (1st / high E). The fretboard draws the high E on top (index 5) and
// the low E on the bottom, matching standard TAB / chord-diagram orientation.

export interface Tuning {
  name: string;
  /** Open-string MIDI numbers, low string (6th) first. */
  openMidi: number[];
}

// E2 A2 D3 G3 B3 E4
export const STANDARD: Tuning = { name: 'Standard (EADGBE)', openMidi: [40, 45, 50, 55, 59, 64] };

// Standard, every string down a half step: Eb Ab Db Gb Bb Eb (Hendrix / SRV / GN'R).
export const EB_STANDARD: Tuning = { name: 'Eb Standard (Eb Ab Db Gb Bb Eb)', openMidi: [39, 44, 49, 54, 58, 63] };

// D2 A2 D3 G3 B3 E4
export const DROP_D: Tuning = { name: 'Drop D (DADGBE)', openMidi: [38, 45, 50, 55, 59, 64] };

// Drop D down a half step: C# G# C# F# A# D#.
export const DROP_CSHARP: Tuning = { name: 'Drop C# (C#G#C#F#A#D#)', openMidi: [37, 44, 49, 54, 58, 63] };

// Drop D down a whole step: C G C F A D.
export const DROP_C: Tuning = { name: 'Drop C (CGCFAD)', openMidi: [36, 43, 48, 53, 57, 62] };

// D2 A2 D3 G3 A3 D4
export const DADGAD: Tuning = { name: 'DADGAD', openMidi: [38, 45, 50, 55, 57, 62] };

export const TUNINGS: Tuning[] = [STANDARD, EB_STANDARD, DROP_D, DROP_CSHARP, DROP_C, DADGAD];
