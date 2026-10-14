// The Theory Lab topic registry. A new topic is one entry here.

import { CHORDS_TOPIC } from './chords';
import { EAR_TOPICS } from './ear';
import { HARMONY_TOPIC } from './harmony';
import { INTERVALS_TOPIC } from './intervals';
import { KEY_SIGNATURES_TOPIC } from './keySignatures';
import type { TheoryTopic } from './types';

/** The written-theory topics, shown on the Theory tab. */
export const TOPICS: TheoryTopic[] = [KEY_SIGNATURES_TOPIC, INTERVALS_TOPIC, CHORDS_TOPIC, HARMONY_TOPIC];

export function topicById(id: string): TheoryTopic | undefined {
  return [...TOPICS, ...EAR_TOPICS].find((t) => t.id === id);
}

export { EAR_TOPICS };
