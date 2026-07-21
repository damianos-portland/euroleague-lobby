"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import clsx from "clsx";

export function WatchlistButton({
  userId,
  playerId,
  initial,
}: {
  userId: string;
  playerId: string;
  initial: boolean;
}) {
  const [watched, setWatched] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, playerId }),
      });
      const data = await res.json();
      setWatched(data.watched);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={toggle} disabled={loading} className={clsx(watched ? "btn-primary" : "btn-ghost")}>
      <Star size={16} className={watched ? "fill-white" : ""} />
      {watched ? "Στο Watchlist" : "Add to Watchlist"}
    </button>
  );
}
