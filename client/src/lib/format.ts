export function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return formatTime(iso);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function conversationTitle(
  type: "dm" | "group",
  name: string | null,
  members: { userId: string; user: { displayName: string } }[],
  me: string,
) {
  if (type === "group") return name || "Group";
  const other = members.find((m) => m.userId !== me);
  return other?.user.displayName ?? "Chat";
}
