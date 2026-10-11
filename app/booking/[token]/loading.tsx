export default function Loading() {
  return (
    <section className="confirm" aria-busy="true" aria-label="Loading">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-row" />
    </section>
  );
}
