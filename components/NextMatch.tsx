"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import type { PublishedMatch } from "@/lib/types";
import styles from "./NextMatch.module.css";

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function NextMatch({ matches }: { matches: PublishedMatch[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const sortedMatches = useMemo(
    () => matches.slice().sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [matches]
  );

  const next = now === null
    ? sortedMatches[0]
    : sortedMatches.find((match) => new Date(match.kickoff).getTime() > now);

  return (
    <section className={styles.section}>
      <div className={`section-head ${styles.head}`}>
        <div>
          <span className="eyebrow">Next match</span>
          <h3>Next published kickoff</h3>
        </div>
        <span className="pill live">AUTO</span>
      </div>

      {next ? (
        <Link className={styles.card} href={`/match/${next.slug}`}>
          <div className={styles.main}>
            <div className="card-top">
              <span className={`focus ${next.focus.toLowerCase().replaceAll(" ", "-")}`}>{next.focus}</span>
              <span className="kickoff">{formatKickoff(next.kickoff)} ICT</span>
            </div>

            <div className={styles.leagueRow}>
              <BrandLogo kind="league" name={next.competition} className={styles.leagueLogo} />
              <span className={styles.leagueName}>{next.competition}</span>
            </div>

            <div className={styles.matchup}>
              <div className={styles.team}>
                <BrandLogo kind="team" name={next.home} className={styles.teamLogo} />
                <strong>{next.home}</strong>
              </div>
              <span className={styles.vs}>vs</span>
              <div className={styles.team}>
                <BrandLogo kind="team" name={next.away} className={styles.teamLogo} />
                <strong>{next.away}</strong>
              </div>
            </div>
          </div>
          <div className={styles.countdown}>
            <span>Kickoff in</span>
            <strong>{now === null ? "—" : formatCountdown(new Date(next.kickoff).getTime() - now)}</strong>
            <small>Changes automatically at kickoff</small>
          </div>
        </Link>
      ) : (
        <div className={styles.empty}>
          <span className="eyebrow">Board complete</span>
          <h3>No future published matches.</h3>
          <p>Publish the next researched slate to populate this section.</p>
        </div>
      )}
    </section>
  );
}
