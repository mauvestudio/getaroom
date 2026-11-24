// Règle « coller en bas » du chat : suivre la réponse qui s'écrit tant que l'utilisateur est en bas, et la lâcher
// dès qu'il remonte — même de quelques pixels. L'ancienne règle (distance 50/100 px) avait une zone morte où le
// collage n'était jamais relâché : la fenêtre ramenait de force en bas pendant qu'on essayait de remonter.

/** Distance (px) en dessous de laquelle on considère être revenu en bas. */
export const PIN_RESTORE_DISTANCE = 8;

export interface ScrollSample {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export const distanceFromBottom = ({ scrollTop, scrollHeight, clientHeight }: ScrollSample): number =>
  scrollHeight - scrollTop - clientHeight;

/**
 * Nouvel état « collé en bas » après un événement de défilement.
 * - revenu à moins de `PIN_RESTORE_DISTANCE` du bas : collé ;
 * - remontée (scrollTop a diminué) alors qu'on n'est pas en bas : décollé ;
 * - sinon : inchangé (on descend vers le bas sans y être encore, ou le contenu a bougé).
 * Un scrollTop qui diminue parce que le contenu raccourcit (le navigateur le ramène) laisse la distance à ~0 : jamais un décollage.
 */
export function nextPinned(wasPinned: boolean, previousScrollTop: number, sample: ScrollSample): boolean {
  if (distanceFromBottom(sample) <= PIN_RESTORE_DISTANCE) return true;
  if (sample.scrollTop < previousScrollTop - 1) return false;
  return wasPinned;
}
