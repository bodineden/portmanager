import type { MascotMood } from "./mascot";

export type MascotMotionClip = "idle" | "happy_clap" | "excited_bounce";

const MASCOT_MOTION_BY_MOOD = {
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

export function mascotMotionForMood(mood: MascotMood): MascotMotionClip {
  return MASCOT_MOTION_BY_MOOD[mood];
}
