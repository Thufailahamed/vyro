import type { ReactNode } from 'react';

type Rule = {
  name: string;
  component: string;
  description: string;
  severity: string;
  threshold: number;
  window: string;
  comparator: string;
  enabled: boolean;
  silenced: boolean;
};

export function AlertRuleCard({
  rule,
  onSilence,
}: {
  rule: Rule;
  onSilence: () => void;
}): ReactNode {
  return (
    <div className="border rounded p-3 mb-2">
      <div className="flex justify-between">
        <div>
          <div className="font-medium">{rule.name}</div>
          <div className="text-sm text-gray-600">{rule.description}</div>
        </div>
        <div className="text-right text-sm">
          <div>{rule.component}</div>
          <div>
            {rule.comparator} {rule.threshold} / {rule.window}
          </div>
          <div>severity={rule.severity}</div>
        </div>
      </div>
      <div className="mt-2 text-sm">
        {rule.silenced ? (
          <span className="text-yellow-700">silenced</span>
        ) : rule.enabled ? (
          <span className="text-green-700">enabled</span>
        ) : (
          <span className="text-gray-500">disabled</span>
        )}
        <button
          onClick={onSilence}
          className="ml-3 px-2 py-1 border rounded text-xs"
        >
          Silence…
        </button>
      </div>
    </div>
  );
}