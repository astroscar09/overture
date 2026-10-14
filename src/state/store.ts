// A very small observable store.
//
// `src/state.ts` stays what it is: shared instrument settings (bpm, metre,
// tuning) that modules read and write directly. That works because the
// metronome is the thing that notices changes. The new features need something
// different — several panels reacting to the same change — so they get this.
//
// Deliberately not a framework: get, set, subscribe, and nothing else.

export type Unsubscribe = () => void;
export type Listener<T> = (state: Readonly<T>, previous: Readonly<T>) => void;

export interface Store<T extends object> {
  get(): Readonly<T>;
  /** Shallow-merge a patch. Listeners only fire if something actually changed. */
  set(patch: Partial<T>): void;
  /** Replace the whole state. */
  reset(next: T): void;
  subscribe(listener: Listener<T>): Unsubscribe;
}

function shallowEqual<T extends object>(a: T, b: Partial<T>): boolean {
  return (Object.keys(b) as (keyof T)[]).every((k) => Object.is(a[k], b[k]));
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial };
  const listeners = new Set<Listener<T>>();

  const emit = (previous: T): void => {
    // Snapshot first: a listener that subscribes or unsubscribes while we are
    // notifying must not change who gets this round.
    for (const listener of [...listeners]) {
      try {
        listener(state, previous);
      } catch (error) {
        // One broken panel must not stop the others from updating.
        console.error('store listener failed', error);
      }
    }
  };

  return {
    get: () => state,
    set(patch) {
      if (shallowEqual(state, patch)) return;
      const previous = state;
      state = { ...state, ...patch };
      emit(previous);
    },
    reset(next) {
      const previous = state;
      state = { ...next };
      emit(previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
