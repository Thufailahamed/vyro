import { useState } from 'react';
import { View } from 'react-native';
import { Camera, FileText, ScanLine, Upload as UploadIcon } from 'lucide-react-native';
import { Banner, Button, Card, Gutter, Kicker, Screen, ScreenHeader, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { appendFile, pickDocument, pickImage, type PickedFile } from '@/lib/files';
import { colors } from '@/theme/tokens';
import { go } from '../shared';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Upload a supplier invoice for OCR — mirrors the web InvoiceUploadPage. */
export function InvoiceUploadScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: PickedFile) {
    setError(null);
    if (!ALLOWED.includes(file.type)) {
      setError('Use JPG, PNG, WebP, or PDF.');
      return;
    }
    if (file.size && file.size > MAX_BYTES) {
      setError('File exceeds 10MB.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      appendFile(form, 'file', file);
      const r = await api.upload<{ uploadId: string; status: string }>('/documents/upload-direct', form);
      if (r.uploadId) go(`/buyer/invoices/${r.uploadId}/review`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pick = async (kind: 'camera' | 'library' | 'files') => {
    const files = kind === 'camera' ? await pickImage({ camera: true }) : kind === 'library' ? await pickImage() : await pickDocument();
    if (files[0]) await submit(files[0]);
  };

  return (
    <Screen keyboard={false}>
      <ScreenHeader
        back
        kicker="Document Intelligence"
        title="Upload a supplier invoice"
        subtitle="OCR is automatic. You'll review every line before it counts toward your analytics."
      />
      <Gutter style={{ gap: 16 }}>
        {error ? <Banner tone="danger" message={error} /> : null}
        <Card kind="bone" padding={32} style={{ alignItems: 'center', gap: 10, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.copper }}>
          <ScanLine size={44} color={colors.copper} strokeWidth={1.4} />
          <Text variant="h2" align="center">
            Scan or upload an invoice
          </Text>
          <Text variant="caption" color="ink4" align="center">
            JPG · PNG · WebP · PDF · max 10MB
          </Text>
        </Card>

        <View style={{ gap: 10 }}>
          <Button title={busy ? 'Uploading…' : 'Take a photo'} icon={Camera} variant="primary" full loading={busy} onPress={() => void pick('camera')} />
          <Button title="Choose from library" icon={UploadIcon} variant="secondary" full disabled={busy} onPress={() => void pick('library')} />
          <Button title="Browse files (PDF)" icon={FileText} variant="ghost" full disabled={busy} onPress={() => void pick('files')} />
        </View>

        <Card kind="flat" padding={14} style={{ gap: 6 }}>
          <Kicker>Tips for a clean read</Kicker>
          <Text variant="caption" color="ink3">
            Photograph the invoice flat, in good light, with all four corners visible. Handwritten totals may need manual review.
          </Text>
        </Card>
      </Gutter>
    </Screen>
  );
}
