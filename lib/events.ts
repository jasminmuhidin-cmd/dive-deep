import type { Submission } from "./types";

type Listener = (submission: Submission) => void;

const globalForEvents = globalThis as unknown as {
  __sharedBurdensListeners?: Set<Listener>;
};

function getListeners(): Set<Listener> {
  if (!globalForEvents.__sharedBurdensListeners) {
    globalForEvents.__sharedBurdensListeners = new Set();
  }
  return globalForEvents.__sharedBurdensListeners;
}

export function subscribe(listener: Listener): () => void {
  const listeners = getListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishSubmission(submission: Submission): void {
  for (const listener of getListeners()) {
    try {
      listener(submission);
    } catch {
      // Ignore broken SSE clients
    }
  }
}
