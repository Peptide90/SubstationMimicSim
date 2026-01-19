import { useCallback, useState } from "react";

import type { EventCategory, EventLogFilters, EventLogItem } from "../../components/EventLog";

export function useEventLog() {
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [filters, setFilters] = useState<EventLogFilters>({
    info: true,
    warn: true,
    error: true,
    debug: false,
    acknowledged: true,
  });

  const appendEvent = useCallback((category: EventCategory, msg: string) => {
    setEvents((ev) => [
      { id: crypto.randomUUID(), ts: Date.now(), category, msg, acknowledged: false },
      ...ev,
    ].slice(0, 500));
  }, []);

  const onToggleFilter = useCallback(
    (cat: EventCategory | "acknowledged") => setFilters((f) => ({ ...f, [cat]: !f[cat] })),
    []
  );

  const onAcknowledgeEvent = useCallback((eventId: string) => {
    setEvents((ev) =>
      ev.map((e) => (e.id === eventId ? { ...e, acknowledged: true } : e))
    );
  }, []);

  return { events, filters, appendEvent, onToggleFilter, onAcknowledgeEvent };
}
