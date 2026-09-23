import Constants from 'expo-constants';

const DEFAULT_API = 'https://vyro-api.thufailahamed627.workers.dev/api';

const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

/**
 * Base URL for every API call, e.g. `https://host/api`.
 * Override per environment with `EXPO_PUBLIC_API_URL` (see .env.example).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || fromExtra || DEFAULT_API).replace(/\/$/, '');

/** Scheme + host of the API. Sent as `Origin` so the Worker's CSRF check and
 *  better-auth's trusted-origin check both see a first-party request. */
export const API_ORIGIN = (() => {
  const m = API_URL.match(/^(https?:\/\/[^/]+)/i);
  return m ? m[1] : API_URL;
})();

/** Public web origin — used for share links and legal pages. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || API_ORIGIN;
