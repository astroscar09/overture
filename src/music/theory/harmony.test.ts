import { describe, expect, it } from 'vitest';
import {
  chordInfo,
  diatonicSevenths,
  diatonicTriads,
  fromRomanNumerals,
  inversionName,
  inversionNotes,
  slashName,
  toRomanNumerals,
} from './harmony';

describe('chord formulas', () => {
  const cases: [string, string, string][] = [
    ['C',      'C E G',        '1 3 5'],
    ['Cm',     'C Eb G',       '1 b3 5'],
    ['Cdim',   'C Eb Gb',      '1 b3 b5'],
    ['Caug',   'C E G#',       '1 3 #5'],
    ['C7',     'C E G Bb',     '1 3 5 b7'],
    ['Cmaj7',  'C E G B',      '1 3 5 7'],
    ['Cm7',    'C Eb G Bb',    '1 b3 5 b7'],
    ['Cm7b5',  'C Eb Gb Bb',   '1 b3 b5 b7'],
    ['Csus4',  'C F G',        '1 4 5'],
  ];
  for (const [symbol, notes, formula] of cases) {
    it(`${symbol} is ${notes} (${formula})`, () => {
      const info = chordInfo(symbol);
      expect(info.notes.join(' ')).toBe(notes);
      expect(info.formula.join(' ')).toBe(formula);
    });
  }

  it('spells chords correctly in awkward keys', () => {
    expect(chordInfo('Gb').notes.join(' ')).toBe('Gb Bb Db');
    expect(chordInfo('F#m7').notes.join(' ')).toBe('F# A C# E');
  });

  it('rejects nonsense rather than returning an empty chord', () => {
    expect(() => chordInfo('Hsplat')).toThrow(/Not a chord/);
  });
});

describe('inversions', () => {
  it('rotates the chord tones', () => {
    expect(inversionNotes('C', 0).join(' ')).toBe('C E G');
    expect(inversionNotes('C', 1).join(' ')).toBe('E G C');
    expect(inversionNotes('C', 2).join(' ')).toBe('G C E');
    expect(inversionNotes('Cmaj7', 3).join(' ')).toBe('B C E G');
  });

  it('wraps round', () => {
    expect(inversionNotes('C', 3)).toEqual(inversionNotes('C', 0));
  });

  it('names them', () => {
    expect(inversionName(0, 3)).toBe('root position');
    expect(inversionName(1, 3)).toBe('first inversion');
    expect(inversionName(2, 3)).toBe('second inversion');
  });

  it('writes them as slash chords', () => {
    expect(slashName('C', 0)).toBe('C');
    expect(slashName('C', 1)).toBe('C/E');
    expect(slashName('Cmaj7', 3)).toBe('Cmaj7/B');
  });
});

describe('diatonic chords', () => {
  it('harmonises a major key', () => {
    expect(diatonicTriads('C', 'major').join(' ')).toBe('C Dm Em F G Am Bdim');
    expect(diatonicSevenths('C', 'major').join(' ')).toBe('Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5');
  });

  it('harmonises a minor key', () => {
    expect(diatonicTriads('A', 'minor').join(' ')).toBe('Am Bdim C Dm Em F G');
    expect(diatonicSevenths('A', 'minor').join(' ')).toBe('Am7 Bm7b5 Cmaj7 Dm7 Em7 Fmaj7 G7');
  });

  it('keeps the spelling of the key', () => {
    expect(diatonicTriads('Gb', 'major')[0]).toBe('Gb');
    expect(diatonicTriads('Gb', 'major')[3]).toBe('Cb');
  });
});

describe('Roman numeral analysis', () => {
  it('uses conventional casing: lowercase means minor', () => {
    expect(toRomanNumerals('C', ['C', 'F', 'G', 'Am']).join(' ')).toBe('I IV V vi');
    expect(toRomanNumerals('A', ['Am', 'Dm', 'Em', 'Am']).join(' ')).toBe('i iv v i');
  });

  it('marks diminished and augmented', () => {
    expect(toRomanNumerals('C', ['Bdim']).join(' ')).toBe('vii°');
    expect(toRomanNumerals('C', ['Caug']).join(' ')).toBe('I+');
  });

  it('handles sevenths', () => {
    expect(toRomanNumerals('C', ['G7']).join(' ')).toBe('V7');
    expect(toRomanNumerals('C', ['Cmaj7']).join(' ')).toBe('Imaj7');
    expect(toRomanNumerals('C', ['Dm7']).join(' ')).toBe('ii7');
    expect(toRomanNumerals('C', ['Bm7b5']).join(' ')).toBe('viiø7');
  });

  it('handles the borrowed chords rock and blues live on', () => {
    // bVII, bVI and bIII are the backbone of the rock vocabulary.
    expect(toRomanNumerals('E', ['E', 'D', 'A', 'E']).join(' ')).toBe('I bVII IV I');
    expect(toRomanNumerals('A', ['A', 'C', 'G', 'D']).join(' ')).toBe('I bIII bVII IV');
  });

  it('writes minor-key degrees without flats, because the signature carries them', () => {
    // Tonal measures everything against the major scale and so returns
    // "bIII bVI bVII" here; a theory class writes "III VI VII".
    expect(toRomanNumerals('A', ['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G'], 'minor').join(' '))
      .toBe('i ii° III iv v VI VII');
    expect(toRomanNumerals('E', ['Em', 'G', 'D'], 'minor').join(' ')).toBe('i III VII');
  });

  it('keeps the flat on a chord that really is outside the minor key', () => {
    // Bb is not in A minor, so it stays bII.
    expect(toRomanNumerals('A', ['Bb'], 'minor')[0]).toBe('bII');
  });

  it('still flags borrowed chords in a major key', () => {
    expect(toRomanNumerals('E', ['E', 'D', 'A', 'E']).join(' ')).toBe('I bVII IV I');
  });

  it('normalises a key name passed as a tonic, which Tonal silently gets wrong', () => {
    // Progression.toRomanNumerals('Am', …) returns "m m 7 m" upstream.
    expect(toRomanNumerals('Am', ['Am', 'Dm', 'E7', 'Am']).join(' ')).toBe('i iv V7 i');
  });
});

describe('building from Roman numerals', () => {
  it('reads conventional casing back', () => {
    expect(fromRomanNumerals('C', ['I', 'IV', 'V', 'vi']).join(' ')).toBe('C F G Am');
    expect(fromRomanNumerals('E', ['I', 'bVII', 'IV', 'I']).join(' ')).toBe('E D A E');
  });

  it('round-trips a progression', () => {
    const chords = ['C', 'Am', 'F', 'G'];
    expect(fromRomanNumerals('C', toRomanNumerals('C', chords))).toEqual(chords);
  });
});
