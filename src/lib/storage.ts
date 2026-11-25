import "server-only";

import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * File storage behind one interface (docs/02 portability rule 2).
 * - "s3": any S3-compatible bucket. Production = Cloudflare R2 (Decision Log 2026-11-24); local = MinIO.
 * - "memory": in-process map for tests/CI only. Refused in production unless explicitly set.
 */
export interface StorageDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Time-limited URL for the owner to open a private file (default 7 days, the S3 maximum). */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60;

function s3Driver(): StorageDriver {
  const bucket = required("S3_BUCKET");
  const client = new S3Client({
    endpoint: required("S3_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    forcePathStyle: true, // MinIO needs path-style; R2 accepts it
    credentials: { accessKeyId: required("S3_ACCESS_KEY_ID"), secretAccessKey: required("S3_SECRET_ACCESS_KEY") },
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async signedUrl(key, expiresInSeconds = SEVEN_DAYS) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

const memoryStore = new Map<string, { body: Uint8Array; contentType: string }>();

function memoryDriver(): StorageDriver {
  return {
    async put(key, body, contentType) {
      memoryStore.set(key, { body, contentType });
    },
    async signedUrl(key) {
      return `memory://${key}`;
    },
    async delete(key) {
      memoryStore.delete(key);
    },
  };
}

/** Test helper: inspect what the memory driver stored. */
export function _memoryObject(key: string) {
  return memoryStore.get(key);
}

/** Test helper: every storage key currently held by the memory driver. */
export function _memoryKeys(): string[] {
  return [...memoryStore.keys()];
}

/** Test helper: empty the memory driver between tests. */
export function _memoryClear() {
  memoryStore.clear();
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (storage driver "s3")`);
  return v;
}

let cached: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (cached) return cached;
  const driver = process.env.STORAGE_DRIVER ?? "s3";
  if (driver === "memory") {
    cached = memoryDriver();
  } else if (driver === "s3") {
    cached = s3Driver();
  } else {
    throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
  return cached;
}

/** uploads/2026/11/<uuid>-<safe-name> — unguessable, never trusts the client's file name for paths. */
export function buildObjectKey(prefix: "uploads" | "quotes" | "mockups", fileName: string, now = new Date()): string {
  const safe =
    fileName
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/\.{2,}/g, ".")
      .replace(/-+\./g, ".")
      .replace(/\.-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(-80) || "file";
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${yyyy}/${mm}/${randomUUID()}-${safe}`;
}
