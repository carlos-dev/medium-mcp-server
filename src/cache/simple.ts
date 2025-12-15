import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { CacheEntry } from "../utils/types.js";

const CACHE_DIR = ".cache";
const CACHE_FILE = join(CACHE_DIR, "cache.json");

interface CacheData {
  [key: string]: CacheEntry<any>;
}

let memoryCache: CacheData = {};
let cacheLoaded = false;

async function ensureCacheDir(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

async function loadCache(): Promise<void> {
  if (cacheLoaded) return;

  try {
    await ensureCacheDir();
    const data = await readFile(CACHE_FILE, "utf-8");
    memoryCache = JSON.parse(data);
    cacheLoaded = true;
  } catch (error) {
    // Cache file doesn't exist yet, start with empty cache
    memoryCache = {};
    cacheLoaded = true;
  }
}

async function saveCache(): Promise<void> {
  try {
    await ensureCacheDir();
    await writeFile(CACHE_FILE, JSON.stringify(memoryCache, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save cache:", error);
  }
}

export async function get<T>(key: string): Promise<T | null> {
  await loadCache();

  const entry = memoryCache[key];
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    // Expired
    delete memoryCache[key];
    await saveCache();
    return null;
  }

  return entry.data as T;
}

export async function set<T>(
  key: string,
  data: T,
  ttl: number = 3600000
): Promise<void> {
  await loadCache();

  memoryCache[key] = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  await saveCache();
}

export async function clear(): Promise<void> {
  memoryCache = {};
  cacheLoaded = true;
  await saveCache();
}

export async function has(key: string): Promise<boolean> {
  await loadCache();
  return key in memoryCache;
}
