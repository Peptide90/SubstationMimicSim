import { useCallback, useRef } from "react";
import type { Node } from "reactflow";

import type { EventCategory } from "../../components/EventLog";
import type { NodeKind, SwitchState } from "../../core/model";

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
  moving?: boolean;
};

type UseSwitchCommandsParams = {
  appendEvent: (category: EventCategory, msg: string) => void;
  checkInterlock: (actionNodeId: string, actionTo: SwitchState) => string | null;
  getMimicData: (node: Node) => MimicData | null;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
};

export function useSwitchCommands({
  appendEvent,
  checkInterlock,
  getMimicData,
  setNodes,
}: UseSwitchCommandsParams) {
  const pendingRef = useRef<Map<string, any>>(new Map());

  const setNodeSwitchState = useCallback(
    (nodeId: string, to: SwitchState) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const md = getMimicData(n);
          if (!md) return n;
          return { ...n, data: { ...(n.data as any), mimic: { ...md, state: to } } };
        })
      );
    },
    [getMimicData, setNodes]
  );

  const setNodeMoving = useCallback(
    (nodeId: string, moving: boolean) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          const md = getMimicData(n);
          if (!md) return n;
          return { ...n, data: { ...(n.data as any), mimic: { ...md, moving } } };
        })
      );
    },
    [getMimicData, setNodes]
  );

  const scheduleSwitchCommand = useCallback(
    (nodeId: string, kind: NodeKind, to: SwitchState) => {
      const blocked = checkInterlock(nodeId, to);
      if (blocked) {
        appendEvent("warn", blocked);
        return;
      }

      if (pendingRef.current.has(nodeId)) {
        appendEvent("warn", `CMD REJECTED ${kind.toUpperCase()} ${nodeId} (already in progress)`);
        return;
      }

      let completionMs = 1000;
      let timeoutMs = 4000;
      if (kind === "cb") {
        completionMs = Math.round(60 + Math.random() * 60);
        timeoutMs = 500;
      } else if (kind === "ds" || kind === "es") {
        completionMs = Math.round(2000 + Math.random() * 1000);
        timeoutMs = 6000;
      }

      const cmdId = `cmd-${crypto.randomUUID().slice(0, 6)}`;
      appendEvent("info", `CMD ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);

      setNodeMoving(nodeId, true);

      const willFail = Math.random() < (kind === "cb" ? 0.01 : 0.03);

      const completeTimer = window.setTimeout(() => {
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        window.clearTimeout(pending.timeoutTimer);
        pendingRef.current.delete(nodeId);

        if (willFail) {
          setNodeMoving(nodeId, false);
          appendEvent("error", `RPT ${kind.toUpperCase()} ${nodeId} FAILED (${to.toUpperCase()})`);
          return;
        }

        setNodeSwitchState(nodeId, to);
        setNodeMoving(nodeId, false);
        appendEvent("info", `RPT ${kind.toUpperCase()} ${nodeId} ${to.toUpperCase()}`);
      }, completionMs);

      const timeoutTimer = window.setTimeout(() => {
        const pending = pendingRef.current.get(nodeId);
        if (!pending || pending.cmdId !== cmdId) return;

        window.clearTimeout(pending.completeTimer);
        pendingRef.current.delete(nodeId);

        setNodeMoving(nodeId, false);
        appendEvent("error", `TIMEOUT ${kind.toUpperCase()} ${nodeId} (${to.toUpperCase()}) after ${timeoutMs} ms`);
      }, timeoutMs);

      pendingRef.current.set(nodeId, { cmdId, completeTimer, timeoutTimer });
    },
    [appendEvent, checkInterlock, setNodeMoving, setNodeSwitchState]
  );

  return { scheduleSwitchCommand };
}
