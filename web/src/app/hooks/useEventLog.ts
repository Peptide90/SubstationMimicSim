import { useCallback, useState } from "react";

import type { EventCategory, EventLogItem } from "../../components/EventLog";

export function useEventLog() {
  const [events, setEvents] = useState<EventLogItem[]>([]);
  const [filters, setFilters] = useState<Record<EventCategory, boolean>>({
    info: true,
    warn: true,
    error: true,
    debug: false,
  });

  const appendEvent = useCallback((category: EventCategory, msg: string) => {
    setEvents((ev) => [{ ts: Date.now(), category, msg }, ...ev].slice(0, 500));
  }, []);

  const onToggleFilter = useCallback(
    (cat: EventCategory) => setFilters((f) => ({ ...f, [cat]: !f[cat] })),
    []
  );

  return { events, filters, appendEvent, onToggleFilter };
}
