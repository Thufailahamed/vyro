import { Link } from 'react-router-dom';
import { useAdminLessons, useAdminDeleteLesson } from './hooks/useAdminLearning';

export function LessonsAdmin() {
  const { data, isLoading } = useAdminLessons();
  const del = useAdminDeleteLesson();

  if (isLoading) return <div>Loading…</div>;
  const lessons = data?.lessons ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Training center — Lessons</h1>
        <Link to="/admin/learning/new" className="rounded bg-sky-600 px-3 py-1 text-white">+ New lesson</Link>
      </div>
      {lessons.length === 0 ? (
        <div className="text-sm text-slate-600">No lessons yet.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th>Title</th>
              <th>Slug</th>
              <th>Track</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => {
              const row = l as { id: string; title: string; slug: string; track: string; isPublished: number | boolean; isRequiredForPublish: number | boolean };
              return (
                <tr key={row.id} className="border-t">
                  <td className="py-2 font-medium">{row.title}</td>
                  <td className="py-2 text-slate-600">{row.slug}</td>
                  <td className="py-2 text-slate-600">{row.track}</td>
                  <td className="py-2 text-xs">
                    {row.isPublished ? 'published' : 'draft'}
                    {row.isRequiredForPublish ? ' · required' : ''}
                  </td>
                  <td className="py-2 text-right space-x-2">
                    <Link to={`/admin/learning/${row.id}/edit`} className="text-sky-700 underline">Edit</Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete "${row.title}"?`)) del.mutate(row.id);
                      }}
                      className="text-rose-700 underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
