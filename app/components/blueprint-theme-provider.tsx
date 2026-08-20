"use client";

import { BlueprintProvider, Classes } from "@blueprintjs/core";

export function BlueprintThemeProvider({ children }: { children: React.ReactNode }) {
  return <BlueprintProvider portalClassName={Classes.DARK}>{children}</BlueprintProvider>;
}
