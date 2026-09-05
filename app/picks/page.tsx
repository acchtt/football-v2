import Link from "next/link";
import PicksClient from "@/components/PicksClient";
import { getPublishedState } from "@/lib/published";

export const dynamic = "force-dynamic";

export default function PicksPage() {
  const state = getPublishedState();
  return (
    <main className="shell">
      <header className="topbar">
        <div><Link href="/" className="back">← Published board</Link><h1>Picks ledger</h1></div>
        <div className="header-pills"><span className="pill">{state.model.version}</span><span className="pill live">AUTO RECORD</span></div>
      </header>

      <section className="hero hero-compact">
        <div>
          <span className="eyebrow">Official website picks</span>
          <h2>Every LOCK becomes part of the record.</h2>
          <p>The ledger records the final line and verified price at the moment the website produces a LOCK. Duplicate verification does not create duplicate picks. Airtable is the remote ledger; browser storage protects unsynced picks until connectivity is restored.</p>
        </div>
      </section>

      <PicksClient />

      <footer><span>Official website LOCKs · 1.00u flat tracking</span><span>Airtable · Website Picks</span></footer>
    </main>
  );
}
