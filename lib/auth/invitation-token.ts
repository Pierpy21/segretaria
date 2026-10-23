import "server-only";
import { createHash, randomBytes } from "node:crypto";

const TOKEN_FORMAT_RE = /^[A-Za-z0-9_-]{43}$/;

/** Token di invito: 32 byte casuali in base64url (43 caratteri). Solo in memoria: mai salvato in chiaro. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash salvato nel database (sha256 hex). */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato atteso del token: un token malformato non va mai cercato nel database. */
export function isInvitationTokenFormat(token: string): boolean {
  return TOKEN_FORMAT_RE.test(token);
}
