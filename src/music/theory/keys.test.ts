import { describe, expect, it } from 'vitest';
import { MAJOR_KEYS_BY_FIFTHS, detectScale, keyInfo, majorKey, minorKey, minorScale, scaleNotes } from './keys';

describe('major key signatures', () => {
  // The full circle, written out by hand from a theory text. If a Tonal upgrade
  // ever changes a spelling, this table fails rather than the app quietly
  // teaching the wrong notes.
  const expected: Record<string, { scale: string; sig: string }> = {
    C:  { scale: 'C D E F G A B',        sig: '' },
    G:  { scale: 'G A B C D E F#',       sig: '#' },
    D:  { scale: 'D E F# G A B C#',      sig: '##' },
    A:  { scale: 'A B C# D E F# G#',     sig: '###' },
    E:  { scale: 'E F# G# A B C# D#',    sig: '####' },
    B:  { scale: 'B C# D# E F# G# A#',   sig: '#####' },
    'F#': { scale: 'F# G# A# B C# D# E#', sig: '######' },
    Db: { scale: 'Db Eb F Gb Ab Bb C',   sig: 'bbbbb' },
    Ab: { scale: 'Ab Bb C Db Eb F G',    sig: 'bbbb' },
    Eb: { scale: 'Eb F G Ab Bb C D',     sig: 'bbb' },
    Bb: { scale: 'Bb C D Eb F G A',      sig: 'bb' },
    F:  { scale: 'F G A Bb C D E',       sig: 'b' },
    Gb: { scale: 'Gb Ab Bb Cb Db Eb F',  sig: 'bbbbbb' },
  };

  for (const [tonic, want] of Object.entries(expected)) {
    it(`${tonic} major is ${want.scale}`, () => {
      const info = majorKey(tonic);
      expect(info.scale.join(' ')).toBe(want.scale);
      expect(info.signature).toBe(want.sig);
      expect(info.accidentals).toBe(want.sig.length);
    });
  }

  it('spells the notes the sharps-only fretboard model cannot', () => {
    // These are the exact cases that make Tonal necessary.
    expect(majorKey('Gb').scale).toContain('Cb');
    expect(majorKey('F#').scale).toContain('E#');
  });

  it('reports which way a key leans', () => {
    expect(majorKey('F#').type).toBe('sharps');
    expect(majorKey('Gb').type).toBe('flats');
    expect(majorKey('C').type).toBe('none');
  });

  it('knows the relative minor', () => {
    expect(majorKey('C').relative).toBe('A');
    expect(majorKey('Eb').relative).toBe('C');
  });

  it('covers all twelve going round the circle', () => {
    expect(MAJOR_KEYS_BY_FIFTHS).toHaveLength(12);
    const chromas = new Set(MAJOR_KEYS_BY_FIFTHS.map((k) => majorKey(k).scale[0]));
    expect(chromas.size).toBe(12);
  });
});

describe('minor keys', () => {
  it('spells natural minor', () => {
    expect(minorKey('A').scale.join(' ')).toBe('A B C D E F G');
    expect(minorKey('C#').scale.join(' ')).toBe('C# D# E F# G# A B');
  });

  it('raises the 7th for harmonic minor', () => {
    expect(minorScale('A', 'harmonic').join(' ')).toBe('A B C D E F G#');
    expect(minorScale('C', 'harmonic').join(' ')).toBe('C D Eb F G Ab B');
  });

  it('raises the 6th and 7th for melodic minor', () => {
    expect(minorScale('A', 'melodic').join(' ')).toBe('A B C D E F# G#');
  });

  it('knows the relative major', () => {
    expect(minorKey('A').relative).toBe('C');
  });
});

describe('scales', () => {
  it('builds the scales Overture already offers', () => {
    expect(scaleNotes('E', 'minor pentatonic').join(' ')).toBe('E G A B D');
    expect(scaleNotes('A', 'blues').join(' ')).toBe('A C D Eb E G');
    expect(scaleNotes('G', 'mixolydian').join(' ')).toBe('G A B C D E F');
    expect(scaleNotes('C', 'whole tone').join(' ')).toBe('C D E F# G# A#');
  });

  it('throws on an unknown scale rather than returning nothing', () => {
    expect(() => scaleNotes('C', 'not a scale')).toThrow(/Unknown scale/);
  });

  it('identifies a scale from its notes', () => {
    expect(detectScale(['E', 'G', 'A', 'Bb', 'B', 'D'])[0]).toBe('E minor blues');
  });
});

describe('keyInfo', () => {
  it('dispatches on mode', () => {
    expect(keyInfo('A', 'minor').scale.join(' ')).toBe('A B C D E F G');
    expect(keyInfo('A', 'major').scale.join(' ')).toBe('A B C# D E F# G#');
  });

  it('rejects nonsense', () => {
    expect(() => majorKey('H')).toThrow(/Not a key/);
  });
});
