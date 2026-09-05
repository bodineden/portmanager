"use client";

import { BlueprintProvider } from "@blueprintjs/core";

export function BlueprintThemeProvider({ children }: { children: React.ReactNode }) {
  return <BlueprintProvider>{children}</BlueprintProvider>;
}
