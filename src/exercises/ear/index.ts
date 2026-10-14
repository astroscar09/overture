// The ear-training topics, in the order they build on each other.

import type { TheoryTopic } from '../types';
import { EAR_CHORDS_TOPIC } from './chords';
import { EAR_FRETBOARD_TOPIC } from './fretboard';
import { EAR_INTERVALS_TOPIC } from './intervals';
import { EAR_SCALES_TOPIC } from './scales';

export const EAR_TOPICS: TheoryTopic[] = [
  EAR_INTERVALS_TOPIC,
  EAR_CHORDS_TOPIC,
  EAR_SCALES_TOPIC,
  EAR_FRETBOARD_TOPIC,
];

export { EAR_INTERVALS_TOPIC, EAR_CHORDS_TOPIC, EAR_SCALES_TOPIC, EAR_FRETBOARD_TOPIC };
