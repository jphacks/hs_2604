"use client";
// 画面から使うリポジトリ。Supabase 版ができたらここで切り替える
import { browserStorage, createMockRepository } from "./mock-repository";
import type { AdsRepository } from "./repository";

let repo: AdsRepository | null = null;

export function getRepository(): AdsRepository {
  if (!repo) repo = createMockRepository(browserStorage());
  return repo;
}

export { PermissionError, ValidationError } from "./repository";
