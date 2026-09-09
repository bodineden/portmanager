import type { MascotMood } from "./mascot";

export type MascotMotionClip = "idle" | "happy_clap" | "excited_bounce";

export type MascotMotionMedia = {
  webm: `/mascot/motion-${string}.webm`;
  mp4: `/mascot/motion-${string}.mp4`;
};

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

const MASCOT_MEDIA_BY_MOTION = {
  idle: {
    webm: "/mascot/motion-idle.webm",
    mp4: "/mascot/motion-idle.mp4",
  },
  happy_clap: {
    webm: "/mascot/motion-happy-clap.webm",
    mp4: "/mascot/motion-happy-clap.mp4",
  },
  excited_bounce: {
    webm: "/mascot/motion-excited-bounce.webm",
    mp4: "/mascot/motion-excited-bounce.mp4",
  },
} as const satisfies Record<MascotMotionClip, MascotMotionMedia>;

export function mascotMotionForMood(mood: MascotMood): MascotMotionClip {
  return MASCOT_MOTION_BY_MOOD[mood];
}

export function mascotMediaForMotion(clip: MascotMotionClip): MascotMotionMedia {
  return MASCOT_MEDIA_BY_MOTION[clip];
}
