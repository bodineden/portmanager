export function LoadingPanel({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <main className="loading-canvas">
      <section className="loading-panel">
        <span className="loading-radar" aria-hidden="true"><span /></span>
        <p className="eyebrow">SYSTEM REQUEST</p>
        <h1>{label}</h1>
        <p>Synchronizing the latest portfolio workspace state.</p>
      </section>
    </main>
  );
}
