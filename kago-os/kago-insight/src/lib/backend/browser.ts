"use client";

import { createBrowserBackend } from "@kago/backend";
import { getBackendConfig } from "./config";

export function createBrowserBackendClient() {
  return createBrowserBackend(getBackendConfig());
}
