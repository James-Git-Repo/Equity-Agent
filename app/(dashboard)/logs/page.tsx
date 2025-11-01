export default function LogsPage() {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Job Logs</h2>
      <p className="mt-2 text-sm text-stone-600">
        Historical fetch attempts, backoff traces, and cache timestamps will be listed here. The core processor already emits
        structured log items that can be persisted.
      </p>
    </section>
  );
}
