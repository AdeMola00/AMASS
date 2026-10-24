/**
 * Tiny cross-screen signal: "unread counts changed — refresh the tab badges now".
 * Fired by the notification feed after read / dismiss / clear; the floating tab bar subscribes.
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function notifyBadges() {
  listeners.forEach((l) => l());
}

export function subscribeBadges(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
