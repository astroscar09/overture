import * as Tone from 'tone';

// Browsers block audio until a user gesture. `ensureAudio()` must be awaited
// from within a click/keypress handler before any sound is produced.

let started = false;

export async function ensureAudio(): Promise<void> {
  if (!started) {
    await Tone.start();
    started = true;
  }
}

export function isAudioStarted(): boolean {
  return started;
}

// Polyphonic synth used to preview notes when the user clicks the fretboard.
let noteSynth: Tone.PolySynth | null = null;

function getNoteSynth(): Tone.PolySynth {
  if (!noteSynth) {
    noteSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.25, release: 0.8 },
    }).toDestination();
    noteSynth.volume.value = -8;
  }
  return noteSynth;
}

/** Play a single note (e.g. "E4") through the preview synth. */
export async function playNote(note: string, duration: Tone.Unit.Time = '8n'): Promise<void> {
  await ensureAudio();
  getNoteSynth().triggerAttackRelease(note, duration);
}

/** Strum a set of notes (low→high) with a small delay between strings. */
export async function playChord(notes: string[], strumSeconds = 0.03): Promise<void> {
  await ensureAudio();
  const synth = getNoteSynth();
  const start = Tone.now();
  notes.forEach((note, i) => {
    synth.triggerAttackRelease(note, '2n', start + i * strumSeconds);
  });
}
