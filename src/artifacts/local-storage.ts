import "server-only";

export {
  readStoredArtifact,
  removeUnregisteredArtifact,
  storeImmutableArtifact,
  type StoredArtifact,
} from "@/artifacts/local-storage-node";
