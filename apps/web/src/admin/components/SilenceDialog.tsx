import { useState } from 'react';

export function SilenceDialog({
  ruleName,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  onConfirm: (durationMinutes: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-4 rounded shadow w-96">
        <h2 className="font-semibold mb-2">Silence {ruleName}</h2>
        <label className="block text-sm">
          Duration (minutes)
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="block w-full border rounded px-2 py-1"
          />
        </label>
        <label className="block text-sm mt-2">
          Reason
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="block w-full border rounded px-2 py-1"
          />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1 border rounded">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(duration, reason)}
            className="px-3 py-1 bg-blue-600 text-white rounded"
          >
            Silence
          </button>
        </div>
      </div>
    </div>
  );
}