"use client";

import { createBrowserBackend } from "@kago/backend";
import { insightCookieScope } from "../paths";
import { getBackendConfig } from "./config";

export function createBrowserBackendClient() {
  return createBrowserBackend(getBackendConfig(), insightCookieScope);
}
