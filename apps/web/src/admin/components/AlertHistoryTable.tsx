export function AlertHistoryTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="text-left">Time</th>
          <th>Rule</th>
          <th>Severity</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="py-1">
              {new Date(r.createdAt).toISOString()}
            </td>
            <td>{r.sourceRef}</td>
            <td>{r.severity}</td>
            <td>{r.title}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}