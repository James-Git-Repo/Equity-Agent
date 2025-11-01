export default function SettingsPage() {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Settings</h2>
      <p className="mt-2 text-sm text-stone-600">
        Configure scoring weights, rate limits, exchange suffix rules, and macro assumptions. The API already respects the
        defaults (weights, WACC guardrails, and terminal growth) via environment variables.
      </p>
      <p className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-500">
        A dedicated settings management UI, persisted to Supabase, will be connected in a follow-up change.
      </p>
    </section>
  );
}
