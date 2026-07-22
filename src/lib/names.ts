// Shared name-normalisation helpers for API ingestion.

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-zà-ÿ])/g, (_m, b, c) => b + c.toUpperCase())
    // Keep Roman-numeral suffixes and "Mc"/"Mac" prefixes readable.
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Jr|Sr)\b/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, c) => "Mc" + c.toUpperCase());
}

// Split the stats "SURNAME, FIRSTNAME" common name into { first, last }.
export function splitStatsName(name: string): { first: string; last: string } {
  const parts = String(name || "").split(",");
  return {
    last: titleCase((parts[0] || "").trim()),
    first: titleCase((parts[1] || "").trim()),
  };
}
