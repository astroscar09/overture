# Overture

A browser-based **guitar practice tool**. The goal is a single place to work on
timing and fretboard fluency: a rock-solid metronome alongside an interactive
guitar neck, with timed chord-change drills and a custom backing-track builder
planned on top.

## v1 — Metronome + Fretboard

- **Metronome** built on the Web Audio clock (via [Tone.js](https://tonejs.github.io/)):
  sample-accurate timing that doesn't drift, with an accented downbeat and a
  visual beat indicator synced to the sound.
- **Tempo control** — BPM slider plus **tap tempo** (button or spacebar).
- **Time signatures** — 2/4 through 7/4.
- **Interactive fretboard** — an SVG neck that can show every note name or
  highlight a scale (root emphasised). Supports Standard, Drop D, and DADGAD
  tunings. Click any position to hear the pitch.

## Practice tab

Routines to work through with the shared metronome running. The first one:

- **3NPS positions · all 12 keys** — the 12 major keys are shuffled into slots
  1–12 and revealed one at a time with **Next key**. For each key, start on the
  lowest fretted scale note on the A string, play a 3-notes-per-string position
  up to the high E, then start from each next scale note until the octave. The
  neck highlights each position (the starting note is ringed).
- A stopwatch times each key (Start also starts the click and a drone on the
  key's root, with an optional 5th). After all 12 keys you get a summary, and
  recent sessions are kept in the browser.

- **Improv · key, range & subdivision** — pick a key (major or natural minor)
  and a 3–6 fret range, or roll a random one; the neck shows only that key's
  notes in the range. Choose a subdivision (it sets the click), a backing
  progression in the key and/or a drone, then improvise without breaking the
  subdivision for as long as you can. The timer is the score, and recent
  attempts plus your longest hold are kept in the browser.

## Getting started

Requires Node ≥ 18.

```bash
npm install
npm run dev      # start the Vite dev server, then open the printed URL
```

Other scripts:

```bash
npm run build     # type-check and produce a production build in dist/
npm run preview   # serve the production build locally
npm run typecheck # type-check only
```

## Project layout

```
src/
  main.ts              bootstrap: builds the UI and wires modules together
  state.ts             shared defaults (bpm, time signature, tuning)
  audio/
    engine.ts          Tone.js init + note-preview synth
    metronome.ts       transport-scheduled clicks with audio-synced callbacks
    drone.ts           sustained key-centre drone for the Practice tab
  music/
    notes.ts           MIDI <-> note-name helpers
    tuning.ts          standard + alternate tunings
    scales.ts          scale interval definitions
    threeNps.ts        3-notes-per-string scale positions
    improv.ts          improv routine: progressions, fret-range notes
  practice/
    keySession.ts      shuffled pass through all 12 keys, with times
    stopwatch.ts       practice timer
    history.ts         localStorage helpers for practice history
  fretboard/
    Fretboard.ts       SVG neck: render, highlight, click-to-hear
  ui/
    controls.ts        transport / tempo / tabs / fretboard controls
    practicePanel.ts   Practice tab: routine picker
    routines/          one file per practice routine (+ shared types)
    dom.ts             small DOM helpers
    styles.css
```

## Roadmap

- **Timed chord-change trainer** — chord shapes on the fretboard, prompts cycled
  in tempo for improv drills.
- **Backing-track builder** — enter a chord progression (durations or spacebar
  tap-tempo), then loop it to play over.
- **Listening** — optional mic input, starting with a monophonic tuner / note
  readout.
