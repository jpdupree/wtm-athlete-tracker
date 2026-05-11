import { kv } from "@vercel/kv";

const memory = new Map<string, unknown>();
const useKV = !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;

export async function kvGet<T>(key: string): Promise<T | null> {
  if (useKV) return (await kv.get<T>(key)) ?? null;
  return (memory.get(key) as T | undefined) ?? null;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (useKV) {
    await kv.set(key, value);
    return;
  }
  memory.set(key, value);
}
