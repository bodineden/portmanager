import { describe, expect, it } from "vitest";
import { mascotMotionForMood, type MascotMotionClip } from "./mascot-motion";
import type { MascotMood } from "./mascot";

const EXPECTED_MOTIONS = {
  calm: "idle",
  happy: "happy_clap",
  excited: "excited_bounce",
  thinking: "idle",
  worried: "idle",
  sad: "idle",
  sleepy: "idle",
  proud: "happy_clap",
  alert: "idle",
} as const satisfies Record<MascotMood, MascotMotionClip>;

const MOODS = Object.keys(EXPECTED_MOTIONS) as MascotMood[];

describe("mascot mood motion mapping", () => {
  it.each(MOODS)("maps %s to its contracted animation clip", (mood) => {
    expect(mascotMotionForMood(mood)).toBe(EXPECTED_MOTIONS[mood]);
  });

  it("covers all nine moods exactly with six idle, two clap and one bounce mappings", () => {
    expect(MOODS).toHaveLength(9);
    expect(new Set(MOODS).size).toBe(9);
    expect(MOODS.toSorted()).toEqual([
      "alert", "calm", "excited", "happy", "proud", "sad", "sleepy", "thinking", "worried",
    ]);
    expect(MOODS.map(mascotMotionForMood)).toEqual([
      "idle", "happy_clap", "excited_bounce", "idle", "idle", "idle", "idle", "happy_clap", "idle",
    ]);
    expect(Object.values(EXPECTED_MOTIONS).filter((clip) => clip === "idle")).toHaveLength(6);
    expect(Object.values(EXPECTED_MOTIONS).filter((clip) => clip === "happy_clap")).toHaveLength(2);
    expect(Object.values(EXPECTED_MOTIONS).filter((clip) => clip === "excited_bounce")).toHaveLength(1);
  });
});
