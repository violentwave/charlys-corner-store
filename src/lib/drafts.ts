import "server-only";

import { MOCKUP_FILES_RETENTION_DAYS } from "./retention";

/** Draft images are re-uploaded on every save, so they live 30 days from the last save. */
export function draftFilesExpireAt(updatedAt: Date, hasFiles: boolean): Date | null {
  return hasFiles ? new Date(updatedAt.getTime() + MOCKUP_FILES_RETENTION_DAYS * 24 * 60 * 60 * 1000) : null;
}

export function draftFilesExpired(updatedAt: Date, hasFiles: boolean, now = Date.now()): boolean {
  const at = draftFilesExpireAt(updatedAt, hasFiles);
  return !!at && at.getTime() <= now;
}
