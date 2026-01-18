import { useCallback, useMemo, useState } from "react";
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

  const toggleFilter = useCallback((cat: EventCategory) => {
    setFilters((f) => ({ ...f, [cat]: !f[cat] }));
  }, []);

  const filteredEvents = useMemo(() => events.filter((e) => filters[e.category]), [events, filters]);

  return { events, filters, appendEvent, toggleFilter, filteredEvents };
}
