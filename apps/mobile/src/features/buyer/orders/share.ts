import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '@/lib/api';

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function writeCache(fileName: string, content: string | Uint8Array): string {
  const file = new File(Paths.cache, safeName(fileName));
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  return file.uri;
}

async function share(uri: string, mimeType: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
}

/**
 * Download an authenticated API file (session cookie is attached by `api.raw`)
 * into the cache and hand it to the OS share sheet (save / print / send).
 */
export async function shareApiFile(path: string, fileName: string, mimeType = 'application/octet-stream') {
  const res = await api.raw(path.replace(/^\/api(?=\/)/, ''));
  const buf = new Uint8Array(await res.arrayBuffer());
  const uri = writeCache(fileName, buf);
  await share(uri, res.headers.get('content-type') ?? mimeType, fileName);
}

/** Fetch an authenticated text document (e.g. invoice HTML) as a string. */
export async function fetchApiText(path: string): Promise<string> {
  const res = await api.raw(path);
  return res.text();
}

export async function shareText(content: string, fileName: string, mimeType: string) {
  const uri = writeCache(fileName, content);
  await share(uri, mimeType, fileName);
}
