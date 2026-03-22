import { ShipClient } from './client.js';
import { loadConfig } from '../config.js';

let _proactiveClient: ShipClient | null = null;

/**
 * Returns a ShipClient for proactive mode (Bearer token auth).
 * Lazily created from config on first call.
 * Returns null if config is not available (e.g. in test without env vars).
 */
export function getProactiveClient(): ShipClient | null {
  if (_proactiveClient) return _proactiveClient;

  try {
    const config = loadConfig();
    _proactiveClient = ShipClient.withToken(config.shipApiUrl, config.shipApiToken);
    return _proactiveClient;
  } catch {
    return null;
  }
}

/**
 * Returns a ShipClient for on-demand mode (forwarded cookie auth).
 */
export function getOnDemandClient(baseUrl: string, cookie: string): ShipClient {
  return ShipClient.withCookie(baseUrl, cookie);
}

/**
 * Returns the appropriate ShipClient based on graph state mode.
 * On-demand with a session cookie → cookie-based client (user's auth).
 * On-demand without cookie → null (caller must handle; never fall back to
 * proactive client, which would violate Invariant 6: "on-demand mode sees
 * only what the user sees").
 * Proactive → service account client.
 */
export function getClientForState(state: { mode: string; sessionCookie?: string | null }): ShipClient | null {
  if (state.mode === 'on_demand') {
    if (!state.sessionCookie) return null;
    const config = loadConfig();
    return getOnDemandClient(config.shipApiUrl, state.sessionCookie);
  }
  return getProactiveClient();
}
