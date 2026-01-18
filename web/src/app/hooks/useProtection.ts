import { useCallback } from "react";
import type { Node } from "reactflow";

import type { EventCategory } from "../../components/EventLog";

type UseProtectionParams = {
  appendEvent: (category: EventCategory, msg: string) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
};

export function useProtection({ appendEvent, setNodes }: UseProtectionParams) {
  const toggleDarOnCb = useCallback(
    (cbNodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== cbNodeId) return n;
          const cur = (n.data as any)?.protection ?? {};
          const next = {
            ...cur,
            dar: !(cur.dar === true),
            attempts: cur.attempts ?? 1,
            deadTimeMs: cur.deadTimeMs ?? 800,
            lockout: false,
          };
          return { ...n, data: { ...(n.data as any), protection: next } };
        })
      );
      appendEvent("info", `DAR toggled on ${cbNodeId}`);
    },
    [appendEvent, setNodes]
  );

  const toggleAutoIsolateOnDs = useCallback(
    (dsNodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== dsNodeId) return n;
          const cur = (n.data as any)?.protection ?? {};
          const next = {
            ...cur,
            autoIsolate: !(cur.autoIsolate === true),
          };
          return { ...n, data: { ...(n.data as any), protection: next } };
        })
      );
      appendEvent("info", `Auto isolation toggled on ${dsNodeId}`);
    },
    [appendEvent, setNodes]
  );

  return { toggleDarOnCb, toggleAutoIsolateOnDs };
}
