import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { assetUrl } from './api';

/** A file picked on device, ready to append to FormData. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

/** React Native's FormData accepts `{ uri, name, type }` objects as files. */
export function appendFile(form: FormData, field: string, file: PickedFile) {
  form.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
}

export async function pickImage(opts: { camera?: boolean; multiple?: boolean } = {}): Promise<PickedFile[]> {
  const perm = opts.camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const launch = opts.camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
  const res = await launch({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: !!opts.multiple && !opts.camera,
  });
  if (res.canceled) return [];
  return res.assets.map((a, i) => ({
    uri: a.uri,
    name: a.fileName ?? `photo-${Date.now()}-${i}.jpg`,
    type: a.mimeType ?? 'image/jpeg',
    size: a.fileSize,
  }));
}

export async function pickDocument(opts: { types?: string[]; multiple?: boolean } = {}): Promise<PickedFile[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: opts.types ?? ['application/pdf', 'image/*'],
    multiple: !!opts.multiple,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    name: a.name,
    type: a.mimeType ?? 'application/octet-stream',
    size: a.size ?? undefined,
  }));
}

/**
 * Open an API document (invoice PDF, KYC file, export) in the in-app browser.
 * Authenticated downloads that need the session cookie should instead stream
 * through `api.raw` — the in-app browser does not share the native cookie jar.
 */
export async function openDocument(pathOrUrl: string) {
  const url = assetUrl(pathOrUrl);
  if (url) await WebBrowser.openBrowserAsync(url);
}
