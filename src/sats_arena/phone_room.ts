export const DEFAULT_ROOM_SERVER_URL = "https://melee.landaverde.io";

/** Room URLs carry no wallet credentials and use HTTPS outside local development. */
export function phoneRoomUrlError(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      return "Enter only the phone room server origin, such as https://arena.example.com.";
    }
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      return "Use HTTPS for a remote phone room server.";
    }
    return null;
  } catch {
    return "Enter a valid phone room server URL.";
  }
}
