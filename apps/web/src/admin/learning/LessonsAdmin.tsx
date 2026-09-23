import { Link } from 'react-router-dom';
import { useAdminLessons, useAdminDeleteLesson } from './hooks/useAdminLearning';
import { AdminPage, AdminPageHeader, CellStack, EmptyBlock, Pill, TableCard, TableSkeleton } from '../ui';
import { GraduationCapIcon } from '@/components/icons';

const primaryLinkClass =
  'vyro-btn vyro-btn-primary h-10 px-4 gap-2 text-sm';

export function LessonsAdmin() {
  const { data, isLoading } = useAdminLessons();
  const del = useAdminDeleteLesson();

  const header = (
    <AdminPageHeader
      kicker="Learning"
      title="Training center — Lessons"
      description="Author onboarding and operations lessons, and choose which ones gate supplier publishing."
      actions={
        <Link to="/admin/learning/new" className={primaryLinkClass}>
          + New lesson
        </Link>
      }
    />
  );

  if (isLoading) {
    return (
      <AdminPage>
        {header}
        <TableCard>
          <TableSkeleton rows={5} cols={4} />
        </TableCard>
      </AdminPage>
    );
  }
  const lessons = data?.lessons ?? [];

  return (
    <AdminPage>
      {header}
      {lessons.length === 0 ? (
        <section className="vyro-surface">
          <EmptyBlock
            icon={<GraduationCapIcon size={20} />}
            title="No lessons yet."
            description="Create the first lesson to start building the training center."
          />
        </section>
      ) : (
        <TableCard title="Lessons" description={`${lessons.length} total`}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Track</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const row = l as { id: string; title: string; slug: string; track: string; isPublished: number | boolean; isRequiredForPublish: number | boolean };
                return (
                  <tr key={row.id}>
                    <td>
                      <CellStack primary={row.title} />
                    </td>
                    <td>
                      <span className="font-mono text-xs text-ink-3">{row.slug}</span>
                    </td>
                    <td className="capitalize text-ink-3">{row.track}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.isPublished ? (
                          <Pill tone="success" dot>published</Pill>
                        ) : (
                          <Pill tone="warning" dot>draft</Pill>
                        )}
                        {row.isRequiredForPublish ? <Pill tone="info">required</Pill> : null}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-3 whitespace-nowrap">
                        <Link
                          to={`/admin/learning/${row.id}/edit`}
                          className="text-xs font-medium text-copper transition-colors hover:text-ink"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${row.title}"?`)) del.mutate(row.id);
                          }}
                          className="text-xs font-medium text-rose transition-colors hover:text-ink"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </AdminPage>
  );
}
