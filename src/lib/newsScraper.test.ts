import { describe, it, expect } from "vitest";
import { parseRss, classifyItem, matchEntities, CLUB_ALIASES } from "./newsScraper";

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title><![CDATA[Evan Fournier officially signs two-year extension with Olympiacos]]></title>
  <link>https://example.com/fournier</link>
  <description><![CDATA[The French guard commits through 2028.]]></description>
  <pubDate>Mon, 20 Jul 2026 10:00:00 +0000</pubDate>
</item>
<item>
  <title>Kendrick Nunn reportedly close to NBA return &#8211; sources</title>
  <link>https://example.com/nunn</link>
  <description>Advanced talks, according to sources.</description>
  <pubDate>Sun, 19 Jul 2026 09:00:00 +0000</pubDate>
</item>
</channel></rss>`;

describe("parseRss", () => {
  it("extracts items with CDATA and entities decoded", () => {
    const items = parseRss(RSS_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Evan Fournier officially signs two-year extension with Olympiacos");
    expect(items[0].link).toBe("https://example.com/fournier");
    expect(items[1].title).toContain("Nunn reportedly close to NBA return – sources");
    expect(items[0].pubDate.getUTCFullYear()).toBe(2026);
  });
});

describe("classifyItem", () => {
  it("classifies official signings", () => {
    const c = classifyItem("Fournier officially signs extension", "");
    expect(c.kind).toBe("official");
  });
  it("classifies rumors with confidence boosts", () => {
    const c = classifyItem("Nunn reportedly close to NBA return", "advanced talks, according to sources");
    expect(c.kind).toBe("rumor");
    // base 40 + 20 (close to) + 15 (advanced talks) + 10 (sources) = 85
    expect(c.confidence).toBe(85);
  });
  it("caps confidence at 90 and floors at 10", () => {
    expect(classifyItem("x reportedly close to set to sign advanced talks per sources", "").confidence).toBeLessThanOrEqual(90);
    expect(classifyItem("x reportedly signs, deal denied and unlikely", "").confidence).toBeGreaterThanOrEqual(10);
  });
  it("falls back to news", () => {
    expect(classifyItem("EuroLeague announces schedule", "").kind).toBe("news");
  });
});

describe("matchEntities", () => {
  const players = [
    { id: "p1", firstName: "Evan", lastName: "Fournier" },
    { id: "p2", firstName: "Mike", lastName: "James" },
    { id: "p3", firstName: "Lebron", lastName: "James" },
  ];
  it("matches unique lastName", () => {
    expect(matchEntities("Fournier stays in Piraeus", players).playerId).toBe("p1");
  });
  it("needs firstName when lastName is ambiguous", () => {
    expect(matchEntities("James scores 30", players).playerId).toBeNull();
    expect(matchEntities("Mike James scores 30", players).playerId).toBe("p2");
  });
  it("matches club aliases to codes", () => {
    const m = matchEntities("Olympiacos and Real Madrid discuss deal", players);
    expect(m.teamCodes).toContain("OLY");
    expect(m.teamCodes).toContain("MAD");
  });
  it("exports aliases for all 20 clubs", () => {
    expect(Object.keys(CLUB_ALIASES)).toHaveLength(20);
  });
  it("matches punctuated first names like T.J. for ambiguous last names", () => {
    const roster = [
      { id: "p1", firstName: "T.J.", lastName: "Shorts" },
      { id: "p2", firstName: "Marcus", lastName: "Shorts" },
    ];
    expect(matchEntities("t.j. shorts joins panathinaikos", roster).playerId).toBe("p1");
  });
});
