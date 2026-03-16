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
