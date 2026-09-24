import { SUBDIVISIONS, type Metronome } from '../audio/metronome';
import type { BackingTrack, CompStyle } from '../audio/backing';
import type { Drone } from '../audio/drone';
import type { Fretboard, DisplayMode } from '../fretboard/Fretboard';
import type { AppState } from '../state';
import type { ChordTrainer, TrainerView } from '../trainer/ChordTrainer';
import type { Chord } from '../music/chords';
import { NOTE_NAMES } from '../music/notes';
import { SCALES, scalePitchClasses } from '../music/scales';
import { CHORD_QUALITIES, chordToneRoles, chordToneSet } from '../music/chordTones';
import { compatibleScaleKeys, defaultScaleKey } from '../music/chordScales';
import { triadVoicing } from '../music/triadVoicing';
import { TUNINGS } from '../music/tuning';
import { PROGRESSIONS } from '../music/chords';
import { chordFor, parseChordName, chordDisplayName, QUALITIES, type Quality } from '../music/chordShapes';
import {
  parsePresetBars,
  barsToSteps,
  refitBars,
  transposeBars,
  setSlotBeats,
  addSlot,
  removeSlot,
  type Bar,
} from '../music/progression';
import { el, inlineChk, labeled, option } from './dom';
import { createPracticePanel } from './practicePanel';

interface Deps {
  metronome: Metronome;
  fretboard: Fretboard;
  trainer: ChordTrainer;
  backing: BackingTrack;
  drone: Drone;
  chordPanel: (view: TrainerView | null) => void;
  chordPanelEl: HTMLElement;
  transportEl: HTMLElement;
  state: AppState;
}

const MIN_BPM = 40;
const MAX_BPM = 240;
const MAX_BARS = 32;
const HOLD_VALUE = 'hold';
const DEFAULT_PROGRESSION = 'popC';

type TabName = 'trainer' | 'practice' | 'display';

export function createControls(container: HTMLElement, deps: Deps): void {
  const { metronome, fretboard, trainer, backing, drone, chordPanel, chordPanelEl, transportEl, state } = deps;

  // ---- Transport (start/stop) ----
  // Several Start/Stop buttons can exist (the top bar and one inside the chord
  // trainer); they all drive the same transport and stay in sync.
  const startButtons: HTMLButtonElement[] = [];
  const updateStartBtn = () => {
    for (const btn of startButtons) {
      btn.textContent = metronome.running ? 'Stop' : 'Start';
      btn.classList.toggle('is-running', metronome.running);
    }
  };
  const toggleTransport = async () => {
    await metronome.toggle();
    updateStartBtn();
    if (!metronome.running) {
      prevVoicing = null; // fresh voice-leading next run
      refreshTrainer(); // reset to preview on stop
    }
  };
  const makeStartBtn = (label = 'Start'): HTMLButtonElement => {
    const btn = el('button', { class: 'btn primary', type: 'button' }, [label]);
    btn.addEventListener('click', toggleTransport);
    startButtons.push(btn);
    return btn;
  };
  const startBtn = makeStartBtn('Start');
  const startTransport = async () => {
    if (!metronome.running) await toggleTransport();
  };
  const stopTransport = () => {
    if (metronome.running) void toggleTransport();
  };

  // ---- Practice tab (routines that own the neck while their tab is open) ----
  let currentTab: TabName = 'display';
  const practice = createPracticePanel({
    fretboard,
    metronome,
    drone,
    state,
    startTransport,
    stopTransport,
    setSubdivision: (n) => {
      subdivisionSelect.value = String(n);
      metronome.setSubdivision(n);
    },
  });

  // ---- Beat indicator ----
  const beatDots = el('div', { class: 'beat-dots' });
  const buildBeatDots = () => {
    beatDots.replaceChildren(
      ...Array.from({ length: state.beatsPerMeasure }, (_, i) =>
        el('span', { class: i === 0 ? 'beat-dot accent' : 'beat-dot' }),
      ),
    );
  };
  buildBeatDots();

  // ---- Single beat subscription drives dots + chord trainer ----
  metronome.onBeat((info) => {
    const dots = beatDots.children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('lit', i === info.beat);
    window.setTimeout(() => dots[info.beat]?.classList.remove('lit'), 120);

    if (trainer.active) {
      const view = trainer.handleBeat(info);
      chordPanel(view);
      if (view?.isNewChord) applyTrainerChord(view.current, true);
    }
  });

  // Audio-accurate hook drives the backing track at the exact beat time.
  metronome.onBeatAudio((info, time) => {
    if (!backing.isEnabled() || !trainer.active) return;
    const view = trainer.handleBeat(info);
    if (view) backing.play(view, info, time, metronome.getBpm());
  });

  // ---- BPM (number box with − / + steppers) ----
  const bpmInput = el('input', {
    type: 'number',
    min: String(MIN_BPM),
    max: String(MAX_BPM),
    value: String(state.bpm),
    class: 'bpm-input',
    'aria-label': 'Tempo in BPM',
  }) as HTMLInputElement;

  const setBpm = (bpm: number) => {
    const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    state.bpm = clamped;
    bpmInput.value = String(clamped);
    metronome.setBpm(clamped);
  };
  bpmInput.addEventListener('change', () => setBpm(Number(bpmInput.value) || state.bpm));

  const bpmDown = el('button', { class: 'btn step', type: 'button', 'aria-label': 'Decrease tempo by 1' }, ['−']);
  const bpmUp = el('button', { class: 'btn step', type: 'button', 'aria-label': 'Increase tempo by 1' }, ['+']);
  bpmDown.addEventListener('click', () => setBpm(state.bpm - 1));
  bpmUp.addEventListener('click', () => setBpm(state.bpm + 1));
  const bpmStepper = el('div', { class: 'bpm-stepper' }, [bpmDown, bpmInput, bpmUp]);

  // ---- Click subdivision ----
  const subdivisionSelect = document.createElement('select');
  subdivisionSelect.className = 'select';
  subdivisionSelect.append(...SUBDIVISIONS.map(([n, label]) => option(String(n), label)));
  subdivisionSelect.addEventListener('change', () => {
    metronome.setSubdivision(Number(subdivisionSelect.value));
    practice.syncTransport(); // keep the Practice tab's subdivision picker in step
  });

  // ---- Tap tempo (mouse click only) ----
  const tapBtn = el('button', { class: 'btn', type: 'button' }, ['Tap tempo']);
  let taps: number[] = [];
  const tap = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      let total = 0;
      for (let i = 1; i < taps.length; i++) total += taps[i] - taps[i - 1];
      setBpm(60000 / (total / (taps.length - 1)));
    }
    tapBtn.classList.add('flash');
    window.setTimeout(() => tapBtn.classList.remove('flash'), 120);
  };
  tapBtn.addEventListener('click', tap);

  // Spacebar starts/stops the metronome from anywhere (except while typing in a
  // field). preventDefault runs unconditionally so a previously-clicked button
  // can't "eat" the Space and re-fire itself, and so the page doesn't scroll.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    e.preventDefault();
    void toggleTransport();
  });

  // ---- Time signature (beats per measure) ----
  const timeSigSelect = document.createElement('select');
  timeSigSelect.className = 'select';
  for (const n of [2, 3, 4, 5, 6, 7]) timeSigSelect.append(option(String(n), `${n} / 4`));
  timeSigSelect.value = String(state.beatsPerMeasure);
  timeSigSelect.addEventListener('change', () => {
    state.beatsPerMeasure = Number(timeSigSelect.value);
    metronome.setBeatsPerMeasure(state.beatsPerMeasure);
    buildBeatDots();
    refitBars(bars, state.beatsPerMeasure); // re-even each bar to the new measure
    commitProgression();
  });

  // ---- Fretboard display ----
  const modeSelect = document.createElement('select');
  modeSelect.className = 'select';
  modeSelect.append(
    option('all', 'All notes'),
    option('scale', 'Highlight scale'),
    option('chord', 'Highlight chord'),
    option('improv', 'Two-chord improv'),
  );

  const rootSelect = document.createElement('select');
  rootSelect.className = 'select';
  NOTE_NAMES.forEach((name, pc) => rootSelect.append(option(String(pc), name)));

  const scaleSelect = document.createElement('select');
  scaleSelect.className = 'select';
  for (const [key, scale] of Object.entries(SCALES)) scaleSelect.append(option(key, scale.name));

  const scaleFields = el('div', { class: 'scale-fields' }, [
    labeled('Root', rootSelect),
    labeled('Scale', scaleSelect),
  ]);

  // Chord-tone highlight fields (Feature 1).
  const chordRootSelect = document.createElement('select');
  chordRootSelect.className = 'select';
  NOTE_NAMES.forEach((name, pc) => chordRootSelect.append(option(String(pc), name)));

  const chordQualitySelect = document.createElement('select');
  chordQualitySelect.className = 'select';
  for (const q of Object.values(CHORD_QUALITIES)) chordQualitySelect.append(option(q.id, q.label));

  const buildLegend = () =>
    el('div', { class: 'chord-legend' }, [
      el('span', { class: 'swatch tone-root' }, ['Root']),
      el('span', { class: 'swatch tone-3' }, ['3rd']),
      el('span', { class: 'swatch tone-5' }, ['5th']),
      el('span', { class: 'swatch tone-7' }, ['7th']),
    ]);

  const chordFields = el('div', { class: 'scale-fields hidden' }, [
    labeled('Root', chordRootSelect),
    labeled('Chord', chordQualitySelect),
    buildLegend(),
  ]);

  // Two-chord improv fields (Feature: standalone A/B picker with chord-scales).
  const noteSelect = (): HTMLSelectElement => {
    const s = document.createElement('select');
    s.className = 'select';
    NOTE_NAMES.forEach((name, pc) => s.append(option(String(pc), name)));
    return s;
  };
  const qualitySelectEl = (): HTMLSelectElement => {
    const s = document.createElement('select');
    s.className = 'select';
    for (const q of Object.values(CHORD_QUALITIES)) s.append(option(q.id, q.label));
    return s;
  };
  // Populate a scale dropdown with only the modes compatible with a quality.
  const fillScaleSelect = (sel: HTMLSelectElement, qualityId: string) => {
    sel.replaceChildren(...compatibleScaleKeys(qualityId).map((k) => option(k, SCALES[k].name)));
    sel.value = defaultScaleKey(qualityId);
  };

  const improvARoot = noteSelect();
  const improvAQuality = qualitySelectEl();
  const improvAScale = document.createElement('select');
  improvAScale.className = 'select';
  const improvBRoot = noteSelect();
  const improvBQuality = qualitySelectEl();
  const improvBScale = document.createElement('select');
  improvBScale.className = 'select';

  const improvOverlay = document.createElement('select');
  improvOverlay.className = 'select';
  improvOverlay.append(
    option('both', 'Both scales'),
    option('a', 'Chord A scale'),
    option('b', 'Chord B scale'),
    option('off', 'No scale'),
  );

  const improvLegend = el('div', { class: 'chord-legend' }, [
    el('span', { class: 'swatch improv-a' }, ['Chord A']),
    el('span', { class: 'swatch improv-b' }, ['Chord B']),
    el('span', { class: 'swatch improv-shared' }, ['Shared']),
    el('span', { class: 'swatch improv-scale' }, ['Scale']),
  ]);

  const improvFields = el('div', { class: 'improv-fields hidden' }, [
    el('div', { class: 'improv-chord' }, [
      el('span', { class: 'improv-tag tag-a' }, ['Chord A']),
      labeled('Root', improvARoot),
      labeled('Quality', improvAQuality),
      labeled('Scale', improvAScale),
    ]),
    el('div', { class: 'improv-chord' }, [
      el('span', { class: 'improv-tag tag-b' }, ['Chord B']),
      labeled('Root', improvBRoot),
      labeled('Quality', improvBQuality),
      labeled('Scale', improvBScale),
    ]),
    el('div', { class: 'improv-chord' }, [labeled('Scale overlay', improvOverlay), improvLegend]),
  ]);

  const applyFretboard = () => {
    const mode = modeSelect.value as DisplayMode;
    fretboard.setMode(mode);
    scaleFields.classList.toggle('hidden', mode !== 'scale');
    chordFields.classList.toggle('hidden', mode !== 'chord');
    improvFields.classList.toggle('hidden', mode !== 'improv');
    if (mode === 'scale') {
      const rootPc = Number(rootSelect.value);
      fretboard.setScale(rootPc, scalePitchClasses(rootPc, SCALES[scaleSelect.value]));
    } else if (mode === 'chord') {
      const rootPc = Number(chordRootSelect.value);
      fretboard.setChordTones(chordToneRoles(rootPc, chordQualitySelect.value));
    } else if (mode === 'improv') {
      const rootA = Number(improvARoot.value);
      const rootB = Number(improvBRoot.value);
      const scaleA = scalePitchClasses(rootA, SCALES[improvAScale.value]);
      const scaleB = scalePitchClasses(rootB, SCALES[improvBScale.value]);
      const overlay = improvOverlay.value;
      const scale =
        overlay === 'a' ? scaleA
        : overlay === 'b' ? scaleB
        : overlay === 'both' ? new Set<number>([...scaleA, ...scaleB])
        : new Set<number>();
      fretboard.setImprov({
        chordA: chordToneSet(rootA, improvAQuality.value),
        chordB: chordToneSet(rootB, improvBQuality.value),
        rootA,
        rootB,
        scale,
      });
    }
  };
  modeSelect.addEventListener('change', applyFretboard);
  rootSelect.addEventListener('change', applyFretboard);
  scaleSelect.addEventListener('change', applyFretboard);
  chordRootSelect.addEventListener('change', applyFretboard);
  chordQualitySelect.addEventListener('change', applyFretboard);
  // Improv: root/scale/overlay just re-apply; quality also refits the scale menu.
  for (const c of [improvARoot, improvAScale, improvBRoot, improvBScale, improvOverlay]) {
    c.addEventListener('change', applyFretboard);
  }
  improvAQuality.addEventListener('change', () => {
    fillScaleSelect(improvAScale, improvAQuality.value);
    applyFretboard();
  });
  improvBQuality.addEventListener('change', () => {
    fillScaleSelect(improvBScale, improvBQuality.value);
    applyFretboard();
  });

  // Sensible starting pair: C major → G7 (a I–V), each with its natural mode.
  improvARoot.value = '0';
  improvAQuality.value = 'maj';
  fillScaleSelect(improvAScale, 'maj');
  improvBRoot.value = '7';
  improvBQuality.value = 'dom7';
  fillScaleSelect(improvBScale, 'dom7');

  // ---- Tuning ----
  const tuningSelect = document.createElement('select');
  tuningSelect.className = 'select';
  TUNINGS.forEach((t, i) => tuningSelect.append(option(String(i), t.name)));
  tuningSelect.addEventListener('change', () => {
    state.tuning = TUNINGS[Number(tuningSelect.value)];
    fretboard.setTuning(state.tuning);
    prevVoicing = null; // open strings changed: recompute triad frets afresh
    refreshTrainer();
  });

  // ---- Chord trainer: bar grid ----
  let bars: Bar[] = [];
  let currentKey = 0;

  // Voicing mode (Feature 2): null = full chord; otherwise the true string
  // indices to voice triads/shells on. `prevVoicing` seeds voice-leading.
  // `voicingTonesMode` instead lights every chord tone across the whole neck.
  let voicingStrings: number[] | null = null;
  let voicingTonesMode = false;
  let voicingScaleTonesMode = false;
  let prevVoicing: number[] | null = null;

  const voicingFor = (chord: Chord | null, persist: boolean): number[] | null => {
    if (!chord) return null;
    if (!voicingStrings) return chord.frets; // full-chord mode: today's behaviour
    const { rootPc, quality } = parseChordName(chord.name);
    const voicing = triadVoicing({
      rootPc,
      qualityId: quality,
      strings: voicingStrings,
      openMidi: state.tuning.openMidi,
      prev: prevVoicing,
    });
    if (persist) prevVoicing = voicing;
    return voicing;
  };

  // The scale to solo with over a chord, by quality: major → its major scale,
  // dominant → Mixolydian, minor → whatever flavour the user picked. All rooted
  // at the chord's own root, so the scale moves with the changes.
  const scaleKeyForQuality = (quality: string): string =>
    quality === 'min' ? minorScaleSelect.value : defaultScaleKey(quality);

  // Reflect the trainer's current chord on the neck per the voicing mode: a grip
  // (full / triad shape), the chord's tones across the whole neck, or those tones
  // over a dim chord-scale — all updating live as the progression moves along.
  const applyTrainerChord = (chord: Chord | null, persist: boolean): void => {
    if (voicingTonesMode || voicingScaleTonesMode) {
      fretboard.setChordShape(null); // clear any grip so the mode shows through
      if (chord) {
        const { rootPc, quality } = parseChordName(chord.name);
        fretboard.setMode('chord');
        const scale = voicingScaleTonesMode
          ? scalePitchClasses(rootPc, SCALES[scaleKeyForQuality(quality)])
          : null;
        fretboard.setChordTones(chordToneRoles(rootPc, quality), scale);
      } else {
        fretboard.setChordTones(null, null);
      }
    } else {
      fretboard.setChordShape(voicingFor(chord, persist));
    }
  };

  const measure = () => state.beatsPerMeasure;
  const lastChord = (): Chord => {
    for (let b = bars.length - 1; b >= 0; b--) {
      for (let s = bars[b].slots.length - 1; s >= 0; s--) {
        const chord = bars[b].slots[s].chord;
        if (chord) return chord;
      }
    }
    return chordFor(currentKey, 'maj');
  };

  // The trainer's on/off state is driven by the tab bar (setTab, below). Its
  // body is built here and mounted into the Chord Trainer tab panel.
  let trainerBody: HTMLElement;

  const presetSelect = document.createElement('select');
  presetSelect.className = 'select';
  presetSelect.append(option('', 'Presets…'));
  for (const [key, p] of Object.entries(PROGRESSIONS)) presetSelect.append(option(key, p.name));

  const keySelect = document.createElement('select');
  keySelect.className = 'select';
  NOTE_NAMES.forEach((name, pc) => keySelect.append(option(String(pc), name)));
  keySelect.addEventListener('change', () => {
    const newKey = Number(keySelect.value);
    transposeBars(bars, newKey - currentKey);
    currentKey = newKey;
    prevVoicing = null; // chords moved: restart voice-leading
    commitProgression();
  });

  // Voicing (Feature 2): full chord vs a triad/shell on an adjacent 3-string set.
  // Values encode the true string indices (1st string = index 5).
  const voicingSelect = document.createElement('select');
  voicingSelect.className = 'select';
  voicingSelect.append(
    option('full', 'Full chord'),
    option('tones', 'Chord tones (whole neck)'),
    option('scale-tones', 'Scale + chord tones'),
    option('5,4,3', 'Triads: 1-2-3 (E-B-G)'),
    option('4,3,2', 'Triads: 2-3-4 (B-G-D)'),
    option('3,2,1', 'Triads: 3-4-5 (G-D-A)'),
    option('2,1,0', 'Triads: 4-5-6 (D-A-E)'),
  );

  // Minor-chord scale flavour (only used by "Scale + chord tones"). Major and
  // dominant chords use their standard modes automatically.
  const minorScaleSelect = document.createElement('select');
  minorScaleSelect.className = 'select';
  minorScaleSelect.append(
    option('minor', 'Natural minor (Aeolian)'),
    option('dorian', 'Dorian'),
    option('phrygian', 'Phrygian'),
    option('harmonicMinor', 'Harmonic minor'),
    option('melodicMinor', 'Melodic minor'),
  );
  minorScaleSelect.value = 'minor';
  minorScaleSelect.addEventListener('change', () => refreshTrainer());
  const minorScaleField = labeled('Minor scale', minorScaleSelect);
  minorScaleField.classList.add('hidden');

  // Interval legend (+ a dim "Scale" swatch), shown in the chord-tone modes.
  const voicingLegend = buildLegend();
  voicingLegend.classList.add('hidden');
  const voicingScaleSwatch = el('span', { class: 'swatch improv-scale hidden' }, ['Scale']);
  voicingLegend.append(voicingScaleSwatch);

  voicingSelect.addEventListener('change', () => {
    const v = voicingSelect.value;
    voicingTonesMode = v === 'tones';
    voicingScaleTonesMode = v === 'scale-tones';
    const roleColoured = voicingTonesMode || voicingScaleTonesMode;
    voicingStrings = roleColoured || v === 'full' ? null : v.split(',').map(Number);
    voicingLegend.classList.toggle('hidden', !roleColoured);
    voicingScaleSwatch.classList.toggle('hidden', !voicingScaleTonesMode);
    minorScaleField.classList.toggle('hidden', !voicingScaleTonesMode);
    prevVoicing = null;
    refreshTrainer();
  });

  presetSelect.addEventListener('change', () => {
    const preset = PROGRESSIONS[presetSelect.value];
    if (!preset) return;
    currentKey = preset.key; // default to the preset's own key; user can retune
    keySelect.value = String(preset.key);
    bars = parsePresetBars(preset.bars, measure());
    barsCountInput.value = String(bars.length);
    commitProgression();
    // Leave presetSelect showing the chosen preset.
  });

  const barsCountInput = el('input', {
    type: 'number',
    min: '1',
    max: String(MAX_BARS),
    value: '4',
    class: 'bars-count',
  }) as HTMLInputElement;
  barsCountInput.addEventListener('change', () => {
    const n = Math.max(1, Math.min(MAX_BARS, Math.round(Number(barsCountInput.value) || 1)));
    while (bars.length < n) bars.push({ slots: [{ chord: lastChord(), beats: measure() }] });
    while (bars.length > n && bars.length > 1) bars.pop();
    barsCountInput.value = String(bars.length);
    commitProgression();
  });

  const gridEl = el('div', { class: 'bars-grid' });

  // A single dropdown covering every root × quality, plus "hold".
  const slotSelect = (chord: Chord | null): HTMLSelectElement => {
    const sel = document.createElement('select');
    sel.className = 'select slot-chord';
    sel.append(option(HOLD_VALUE, '— hold'));
    for (let r = 0; r < 12; r++) {
      for (const q of QUALITIES) sel.append(option(`${r}:${q}`, chordDisplayName(r, q)));
    }
    if (chord) {
      const { rootPc, quality } = parseChordName(chord.name);
      sel.value = `${rootPc}:${quality}`;
    } else {
      sel.value = HOLD_VALUE;
    }
    return sel;
  };

  const renderGrid = () => {
    gridEl.replaceChildren(
      ...bars.map((bar, barIndex) => {
        const removeBar = el('button', { class: 'bar-x', type: 'button', 'aria-label': `Remove bar ${barIndex + 1}` }, ['×']);
        removeBar.addEventListener('click', () => {
          if (bars.length > 1) bars.splice(barIndex, 1);
          barsCountInput.value = String(bars.length);
          commitProgression();
        });
        const head = el('div', { class: 'bar-head' }, [String(barIndex + 1), removeBar]);

        const slotEls = bar.slots.map((slot, slotIndex) => {
          const sel = slotSelect(slot.chord);
          sel.addEventListener('change', () => {
            if (sel.value === HOLD_VALUE) {
              slot.chord = null;
            } else {
              const [r, q] = sel.value.split(':');
              slot.chord = chordFor(Number(r), q as Quality);
            }
            commitProgression();
          });

          const beatsInput = el('input', {
            type: 'number',
            min: '1',
            max: String(measure()),
            value: String(slot.beats),
            class: 'slot-beats',
            title: 'beats',
          }) as HTMLInputElement;
          beatsInput.disabled = bar.slots.length === 1;
          beatsInput.addEventListener('change', () => {
            setSlotBeats(bar, slotIndex, Number(beatsInput.value), measure());
            commitProgression();
          });

          const children: (Node | string)[] = [sel, beatsInput];
          if (bar.slots.length > 1) {
            const rm = el('button', { class: 'slot-x', type: 'button', 'aria-label': 'Remove chord' }, ['×']);
            rm.addEventListener('click', () => {
              removeSlot(bar, slotIndex, measure());
              commitProgression();
            });
            children.push(rm);
          }
          return el('div', { class: 'slot' }, children);
        });

        const addChord = el('button', { class: 'add-chord', type: 'button' }, ['+ chord']);
        addChord.disabled = bar.slots.length >= measure();
        addChord.addEventListener('click', () => {
          addSlot(bar, lastChord(), measure());
          commitProgression();
        });

        return el('div', { class: 'bar' }, [head, el('div', { class: 'bar-slots' }, slotEls), addChord]);
      }),
      (() => {
        const addBar = el('button', { class: 'add-bar', type: 'button' }, ['+ Bar']);
        addBar.addEventListener('click', () => {
          if (bars.length >= MAX_BARS) return;
          bars.push({ slots: [{ chord: lastChord(), beats: measure() }] });
          barsCountInput.value = String(bars.length);
          commitProgression();
        });
        return addBar;
      })(),
    );
  };

  const commitProgression = () => {
    trainer.setProgression(barsToSteps(bars));
    renderGrid();
    refreshTrainer();
  };

  // Central sync: reflect current trainer state to the panel + fretboard when
  // idle. While running, per-beat updates own the display.
  const refreshTrainer = () => {
    if (trainer.active) {
      if (!metronome.running) {
        const view = trainer.preview();
        chordPanel(view);
        applyTrainerChord(view?.current ?? null, false);
      }
    } else {
      chordPanel(null);
      fretboard.setChordShape(null);
      if (currentTab === 'practice') practice.refresh();
      else applyFretboard();
    }
  };

  // ---- Assemble: three tab panels (Tempo · Chord Trainer · Display) ----
  // The neck (in #fretboard-panel) stays visible above these panels at all times.
  const transportRow = el('div', { class: 'transport-row' }, [
    el('div', { class: 'transport-start' }, [startBtn, beatDots]),
    labeled('Tempo (BPM)', bpmStepper),
    tapBtn,
    labeled('Click', subdivisionSelect),
    labeled('Time signature', timeSigSelect),
  ]);
  // ---- Backing track (plays the progression out loud to solo over) ----
  const playChordsChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  playChordsChk.addEventListener('change', () => backing.setEnabled(playChordsChk.checked));

  const compSelect = document.createElement('select');
  compSelect.className = 'select';
  compSelect.append(option('sustained', 'Sustained'), option('strummed', 'Strummed'));
  compSelect.addEventListener('change', () => backing.setStyle(compSelect.value as CompStyle));

  const bassChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  bassChk.checked = true;
  bassChk.addEventListener('change', () => backing.setBass(bassChk.checked));

  const muteClickChk = el('input', { type: 'checkbox', class: 'checkbox' }) as HTMLInputElement;
  muteClickChk.addEventListener('change', () => metronome.setClickMuted(muteClickChk.checked));

  const backingVol = el('input', {
    type: 'range',
    min: '0',
    max: '1',
    step: '0.01',
    value: '0.6',
    class: 'bpm-slider',
  }) as HTMLInputElement;
  backingVol.addEventListener('input', () => backing.setVolume(Number(backingVol.value)));

  const backingRow = el('div', { class: 'backing-row' }, [
    inlineChk(playChordsChk, 'Play chords'),
    labeled('Comp', compSelect),
    inlineChk(bassChk, 'Bass'),
    labeled('Volume', backingVol),
    inlineChk(muteClickChk, 'Mute click'),
  ]);

  trainerBody = el('div', { class: 'trainer-body' }, [
    el('div', { class: 'trainer-head' }, [
      labeled('Preset', presetSelect),
      labeled('Key', keySelect),
      labeled('Bars', barsCountInput),
      labeled('Voicing', voicingSelect),
      minorScaleField,
      voicingLegend,
    ]),
    el('div', { class: 'grid-hint' }, ['Each bar is one measure. Use “+ chord” to change chords within a bar; set a bar to “— hold” to sustain the previous chord. Change Key to transpose everything.']),
    gridEl,
    backingRow,
  ]);
  const fretGroup = el('div', { class: 'group' }, [
    labeled('Display', modeSelect),
    scaleFields,
    chordFields,
    improvFields,
    labeled('Tuning', tuningSelect),
  ]);

  // Persistent transport bar (shared tempo/start) mounts above the neck and
  // stays visible on every tab.
  transportEl.replaceChildren(el('div', { class: 'group' }, [transportRow]));

  // Three tab panels; the transport + neck above them stay put as you switch.
  const trainerPanel = el('div', { class: 'tab-panel' }, [
    el('div', { class: 'group trainer-group' }, [trainerBody]),
  ]);
  const practicePanel = el('div', { class: 'tab-panel' }, [practice.element]);
  const displayPanel = el('div', { class: 'tab-panel' }, [fretGroup]);

  // ---- Tab bar ----
  const panels: Record<TabName, HTMLElement> = {
    trainer: trainerPanel,
    practice: practicePanel,
    display: displayPanel,
  };
  const tabButtons: Record<TabName, HTMLButtonElement> = {
    trainer: el('button', { class: 'tab', type: 'button', role: 'tab' }, ['Chord Trainer']),
    practice: el('button', { class: 'tab', type: 'button', role: 'tab' }, ['Practice']),
    display: el('button', { class: 'tab', type: 'button', role: 'tab' }, ['Display']),
  };
  const tabBar = el('div', { class: 'tab-bar', role: 'tablist' }, [
    tabButtons.trainer,
    tabButtons.practice,
    tabButtons.display,
  ]);

  const setTab = (name: TabName) => {
    currentTab = name;
    for (const key of Object.keys(panels) as TabName[]) {
      panels[key].classList.toggle('hidden', key !== name);
      tabButtons[key].classList.toggle('active', key === name);
      tabButtons[key].setAttribute('aria-selected', String(key === name));
    }
    // The Now/Next chords (above the neck) show only on the Chord Trainer tab.
    chordPanelEl.classList.toggle('hidden', name !== 'trainer');
    // The trainer only drives the neck on its own tab; the metronome keeps
    // running across tabs (shared transport).
    trainer.setEnabled(name === 'trainer');
    // Practice hands the neck back before the other tabs redraw it, and takes
    // it over only after refreshTrainer() has run.
    if (name !== 'practice') practice.deactivate();
    prevVoicing = null;
    refreshTrainer();
    if (name === 'practice') practice.activate();
  };
  for (const key of Object.keys(tabButtons) as TabName[]) {
    tabButtons[key].addEventListener('click', () => setTab(key));
  }

  container.replaceChildren(tabBar, trainerPanel, practicePanel, displayPanel);

  // ---- Initial sync ----
  setBpm(state.bpm);
  metronome.setSubdivision(Number(subdivisionSelect.value));
  applyFretboard();
  const initial = PROGRESSIONS[DEFAULT_PROGRESSION];
  currentKey = initial.key;
  keySelect.value = String(initial.key);
  bars = parsePresetBars(initial.bars, measure());
  barsCountInput.value = String(bars.length);
  commitProgression();
  setTab('display'); // open on the Display tab by default
  updateStartBtn();
}
