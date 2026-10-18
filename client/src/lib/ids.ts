const TEMP_PREFIX = "tmp-";

// crypto.randomUUID only exists in secure contexts (https or localhost). When
// the page is opened over plain http on a LAN address, for example from a
// phone, it is undefined, so fall back to a random string.
export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Temporary ids let a new item appear instantly, before the server has given
// it a real id. The prefix lets us recognise "not saved yet" items later.
export function makeTempId(): string {
  return `${TEMP_PREFIX}${makeId()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}
