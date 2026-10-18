import { useConnectionStore, type ConnectionStatus as Status } from "../store/connectionStore";

const LABELS: Record<Status, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
};

export function ConnectionStatus() {
  const status = useConnectionStore((state) => state.status);
  const isLive = status === "connected";

  return (
    // role="status" makes screen readers announce changes politely, so a
    // dropped connection is not visible only to sighted users.
    <p
      role="status"
      className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm font-medium"
    >
      {/* The dot is decoration; the text next to it carries the meaning. */}
      <span
        aria-hidden="true"
        className={`size-2.5 rounded-full ${isLive ? "bg-ok" : "animate-pulse bg-warn"}`}
      />
      <span>
        <span className="sr-only">Connection status: </span>
        {LABELS[status]}
      </span>
    </p>
  );
}
