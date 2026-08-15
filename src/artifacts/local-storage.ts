import "server-only";

import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { getServerEnv } from "@/lib/env";

export type StoredArtifact = {
  storageProvider: "LOCAL";
  storageKey: string;
};

export async function storeImmutableArtifact(
  storageKey: string,
  bytes: Uint8Array,
): Promise<StoredArtifact> {
  const target = resolveStorageTarget(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, "wx");
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return { storageProvider: "LOCAL", storageKey };
}

export async function readStoredArtifact(
  storageKey: string,
): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolveStorageTarget(storageKey)));
}

export async function removeUnregisteredArtifact(
  storageKey: string,
): Promise<void> {
  await rm(resolveStorageTarget(storageKey), { force: true });
}

function resolveStorageTarget(storageKey: string): string {
  if (!/^[a-z0-9][a-z0-9/_.-]+$/i.test(storageKey) || storageKey.includes("..")) {
    throw new Error("Unsafe artifact storage key.");
  }
  const root = path.resolve(getServerEnv().ARTIFACT_STORAGE_DIR);
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Artifact target escaped the configured storage root.");
  }
  return target;
}
