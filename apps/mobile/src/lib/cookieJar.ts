import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Minimal persistent cookie jar for the better-auth session.
 *
 * The API authenticates with cookies (`better-auth.session_token`, prefixed
 * `__Secure-` in production). Native fetch cookie handling differs between
 * iOS and Android and does not survive every reinstall/refresh path, so we
 * read `Set-Cookie` ourselves, keep name→value pairs in SecureStore and send
 * them back as an explicit `Cookie` header.
 */

const KEY = 'vyro.cookies.v1';
let jar: Record<string, string> = {};
let loaded = false;

const isWeb = Platform.OS === 'web';

async function persist() {
  if (isWeb) return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(jar));
  } catch {
    // SecureStore can fail on some emulators; the session still works in memory.
  }
}

export async function loadCookies(): Promise<void> {
  if (loaded || isWeb) {
    loaded = true;
    return;
  }
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    jar = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    jar = {};
  }
  loaded = true;
}

export function cookieHeader(): string | undefined {
  const pairs = Object.entries(jar).map(([k, v]) => `${k}=${v}`);
  return pairs.length ? pairs.join('; ') : undefined;
}

export function hasSessionCookie(): boolean {
  return Object.keys(jar).some((k) => k.includes('session_token'));
}

/**
 * Split a combined Set-Cookie header. Native stacks join multiple cookies with
 * ", " — but `Expires=Wed, 21 Oct` also contains a comma, so only split on a
 * comma that is followed by `name=`.
 */
function splitSetCookie(header: string): string[] {
  return header.split(/,(?=\s*[A-Za-z0-9_.\-]+=)/).map((s) => s.trim()).filter(Boolean);
}

export async function storeSetCookie(header: string | null): Promise<void> {
  if (!header || isWeb) return;
  let changed = false;
  for (const cookie of splitSetCookie(header)) {
    const [pair, ...attrs] = cookie.split(';');
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const attrText = attrs.join(';').toLowerCase();
    const expired =
      value === '' ||
      /max-age=0\b/.test(attrText) ||
      /max-age=-/.test(attrText) ||
      /expires=thu, 01 jan 1970/.test(attrText);
    if (expired) {
      if (name in jar) {
        delete jar[name];
        changed = true;
      }
    } else if (jar[name] !== value) {
      jar[name] = value;
      changed = true;
    }
  }
  if (changed) await persist();
}

export async function clearCookies(): Promise<void> {
  jar = {};
  if (isWeb) return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* noop */
  }
}
