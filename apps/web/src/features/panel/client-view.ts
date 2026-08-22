import type { ClientLinkState } from "../skills/types.js";

export function fallbackClientState(visibleIn: readonly string[], clientId: string): ClientLinkState {
  return visibleIn.includes(clientId) ? "managed" : "off";
}
