/** Shown instantly while a page's data loads, so navigation never feels blocked. */
export default function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="portal" aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="stat-row">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton-card" />)}
      </div>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton skeleton-row" />)}
    </div>
  );
}
