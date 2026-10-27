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
