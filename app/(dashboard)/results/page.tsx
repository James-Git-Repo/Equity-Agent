export default function ResultsPage() {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Results</h2>
      <p className="mt-2 text-sm text-stone-600">
        This page will surface the computed batch with virtualized tables, momentum filters, and export controls once a job has
        been saved to the Supabase cache.
      </p>
      <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
        The initial implementation focuses on the processing engine and API. UI wiring to persisted Supabase data will follow in
        subsequent iterations.
      </p>
    </section>
  );
}
