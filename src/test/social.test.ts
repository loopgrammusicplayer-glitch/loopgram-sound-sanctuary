import { describe, expect, it } from "vitest";
import { bumpStreak, loungeNow, makePartyCode, PARTY_CODE, partyPosition } from "@/lib/social";

const D = Date.UTC(2026, 9, 27, 12);

describe("streaks", () => {
  it("next day adds one", () => expect(bumpStreak({ count: 4, last: "2026-10-26", best: 4 }, D)).toEqual({ count: 5, last: "2026-10-27", best: 5 }));
  it("missing a day resets to 1 but keeps best", () => expect(bumpStreak({ count: 9, last: "2026-10-24", best: 9 }, D)).toEqual({ count: 1, last: "2026-10-27", best: 9 }));
  it("same day does not double count", () => expect(bumpStreak({ count: 3, last: "2026-10-27", best: 3 }, D).count).toBe(3));
});

describe("party", () => {
  it("codes are 6 safe characters", () => expect(PARTY_CODE.test(makePartyCode())).toBe(true));
  it("playing advances with time, paused does not", () => {
    expect(partyPosition({ playing: true, pos: 10, at: 0 }, 5000)).toBe(15);
    expect(partyPosition({ playing: false, pos: 10, at: 0 }, 5000)).toBe(10);
  });
});

describe("lounges", () => {
  it("everyone gets the same track for the same time", () => {
    expect(loungeNow(3, 0)).toEqual({ index: 0, offset: 0 });
    expect(loungeNow(3, 200_000)).toEqual({ index: 1, offset: 20 });
    expect(loungeNow(3, 540_000).index).toBe(0);
  });
});

import { postPartyMedia } from "@/lib/social";
import { activeQuests, parseLive, partyAllowed } from "@/lib/live-settings";
describe("watch together for both sources", () => {
  it("owner upload becomes a file party", () => expect(postPartyMedia("https://pub-x.r2.dev/a/b.mp4")).toEqual({ video: "", file: "https://pub-x.r2.dev/a/b.mp4" }));
  it("youtube post becomes a youtube party", () => expect(postPartyMedia("https://youtu.be/dQw4w9WgXcQ")).toEqual({ video: "dQw4w9WgXcQ" }));
  it("other links are not syncable", () => expect(postPartyMedia("https://vimeo.com/123")).toBeNull());
  it("owner can switch off posts only", () => {
    const s = parseLive({ partyPosts: false });
    expect(partyAllowed(s, "tmdb")).toBe(true);
    expect(partyAllowed(s, "post")).toBe(false);
  });
  it("master switch blocks both", () => expect(partyAllowed(parseLive({ partyOn: false }), "tmdb")).toBe(false));
  it("owner quest edits apply and off quests disappear", () => {
    const q = activeQuests(parseLive({ quests: { listen: { on: false, goal: 2, points: 50 }, watch: { on: true, goal: 5, points: 300 }, share: { on: true, goal: 1, points: 200 } } }));
    expect(q.map((x) => x.id)).toEqual(["watch", "share"]);
    expect(q[0]).toMatchObject({ goal: 5, points: 300 });
  });
});
