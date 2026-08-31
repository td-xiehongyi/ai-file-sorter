import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { SearchQuery, SearchResult } from "../types/search";

export function searchFiles(query: SearchQuery): Promise<SearchResult> {
  return invoke<SearchResult>("search_files", { query });
}

export function listenForIndexChanges(callback: () => void): Promise<UnlistenFn> {
  return listen("files://index-changed", callback);
}

export function listenForWatcherErrors(callback: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>("files://watcher-error", (event) => callback(event.payload));
}
