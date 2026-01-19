import { useCallback, useState } from "react";
import type { Edge, Node } from "reactflow";

import type { EventCategory } from "../../components/EventLog";
import type { NodeKind, SwitchState } from "../../core/model";

type MimicData = {
  kind: NodeKind;
  state?: SwitchState;
  sourceOn?: boolean;
  label?: string;
  moving?: boolean;
};

export type FaultSeverity = "normal" | "severe" | "extreme";

export type Fault = {
  id: string;
  edgeId: string;
  busbarId: string;
  aNodeId: string;
  bNodeId: string;
  x: number;
  y: number;
  severity: FaultSeverity;
  persistent: boolean;
  status: "active" | "cleared";
  createdAt: number;
};

type UseFaultsParams = {
  appendEvent: (category: EventCategory, msg: string) => void;
  edges: Edge[];
  getMimicData: (node: Node) => MimicData | null;
  nodes: Node[];
  scheduleSwitchCommand: (nodeId: string, kind: NodeKind, to: SwitchState) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
};

export function useFaults({
  appendEvent,
  edges,
  getMimicData,
  nodes,
  scheduleSwitchCommand,
  setNodes,
}: UseFaultsParams) {
  const [faults, setFaults] = useState<Record<string, Fault>>({});

  const addFaultNode = useCallback(
    (fault: Fault) => {
      const nodeId = `faultnode-${fault.id}`;
      setNodes((ns) =>
        ns.concat({
          id: nodeId,
          type: "fault",
          position: { x: fault.x - 7, y: fault.y - 7 },
          data: {
            label: `FAULT ${fault.severity.toUpperCase()}`,
            faultId: fault.id,
            busbarId: fault.busbarId,
          },
          draggable: false,
          selectable: true,
        })
      );
    },
    [setNodes]
  );

  const clearFaultById = useCallback(
    (faultId: string) => {
      setFaults((m) => {
        const next = { ...m };
        if (!next[faultId]) return m;
        next[faultId] = { ...next[faultId], status: "cleared" };
        return next;
      });

      setNodes((ns) => ns.filter((n) => !((n.type === "fault") && (n.data as any)?.faultId === faultId)));

      appendEvent("info", `FAULT CLEARED ${faultId}`);
    },
    [appendEvent, setNodes]
  );

  const activeFaultsOnBusbar = useCallback(
    (busbarId: string) =>
      Object.values(faults).filter(
        (f) => f.status === "active" && f.busbarId === busbarId && f.persistent
      ),
    [faults]
  );

  const markNodeFaulted = useCallback(
    (nodeId: string, faulted: boolean, destroyed: boolean = false) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            data: {
              ...(n.data as any),
              faulted,
              destroyed,
            },
          };
        })
      );
    },
    [setNodes]
  );

  const isolateFault = useCallback(
    (fault: Fault) => {
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const adj = new Map<string, Array<{ other: string }>>();

      for (const e of edges) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        if (!adj.has(e.target)) adj.set(e.target, []);
        adj.get(e.source)!.push({ other: e.target });
        adj.get(e.target)!.push({ other: e.source });
      }

      const isBlocking = (nodeId: string) => {
        const n = nodeMap.get(nodeId);
        const md = n ? getMimicData(n) : null;
        if (!md) return false;
        if ((md.kind === "ds" || md.kind === "cb") && md.state !== "closed") return true;
        if (md.kind === "es" && md.state === "closed") return true;
        return false;
      };

      const tripSet = new Set<string>();
      const visited = new Set<string>();
      const q: string[] = [fault.aNodeId, fault.bNodeId];

      while (q.length) {
        const cur = q.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);

        const n = nodeMap.get(cur);
        const md = n ? getMimicData(n) : null;

        if (md?.kind === "cb" && md.state === "closed") {
          tripSet.add(cur);
          continue;
        }

        if (isBlocking(cur)) continue;

        for (const { other } of adj.get(cur) ?? []) {
          if (!visited.has(other)) q.push(other);
        }
      }

      const orderedTrips = Array.from(tripSet);

      for (const cbId of orderedTrips) {
        if (fault.severity === "extreme") {
          if (Math.random() < 0.3) {
            markNodeFaulted(cbId, true, true);
            appendEvent("error", `CB FAIL (DESTROYED) ${cbId} under EXTREME fault`);
            continue;
          }
        }

        scheduleSwitchCommand(cbId, "cb" as NodeKind, "open");

        const cbNode = nodeMap.get(cbId);
        const prot = cbNode ? (cbNode.data as any)?.protection : null;

        if (prot?.dar === true && prot.lockout !== true) {
          const deadTimeMs = prot.deadTimeMs ?? 800;

          window.setTimeout(() => {
            const stillActive = Object.values(faults).some(
              (f) => f.id === fault.id && f.status === "active"
            );
            if (!stillActive) return;

            appendEvent("warn", `DAR RECLOSE attempt on ${cbId}`);
            scheduleSwitchCommand(cbId, "cb" as NodeKind, "closed");

            window.setTimeout(() => {
              const still = Object.values(faults).some(
                (f) => f.id === fault.id && f.status === "active"
              );
              if (!still) return;

              appendEvent("error", `DAR LOCKOUT on ${cbId}`);
              scheduleSwitchCommand(cbId, "cb" as NodeKind, "open");

              setNodes((ns) =>
                ns.map((n) => {
                  if (n.id !== cbId) return n;
                  const cur = (n.data as any)?.protection ?? {};
                  return { ...n, data: { ...(n.data as any), protection: { ...cur, lockout: true } } };
                })
              );
            }, 250);
          }, deadTimeMs);
        }
      }

      if (orderedTrips.length === 0) {
        const firsttx = nodes.find((n) => getMimicData(n)?.kind === "tx" && visited.has(n.id));
        if (firsttx) {
          markNodeFaulted(firsttx.id, true, false);
          appendEvent("error", `TX FAULTED ${firsttx.id} (no CB isolation found)`);
        }
      }
    },
    [appendEvent, edges, faults, getMimicData, markNodeFaulted, nodes, scheduleSwitchCommand, setNodes]
  );

  const createFaultOnEdge = useCallback(
    (
      edgeId: string,
      flowPos: { x: number; y: number },
      opts: { persistent: boolean; severity: FaultSeverity }
    ) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const busbarId = (edge.data as any)?.busbarId ?? "bb-unknown";
      const faultId = `fault-${crypto.randomUUID().slice(0, 6)}`;

      const fault: Fault = {
        id: faultId,
        edgeId,
        busbarId,
        aNodeId: edge.source,
        bNodeId: edge.target,
        x: flowPos.x,
        y: flowPos.y,
        severity: opts.severity,
        persistent: opts.persistent,
        status: "active",
        createdAt: Date.now(),
      };

      setFaults((m) => ({ ...m, [faultId]: fault }));

      appendEvent(
        "error",
        `ALARM FAULT (${fault.severity.toUpperCase()}) between ${edge.source} and ${edge.target} (busbar ${busbarId})`
      );

      if (opts.persistent) addFaultNode(fault);

      isolateFault(fault);

      if (!opts.persistent) {
        window.setTimeout(() => {
          clearFaultById(faultId);
        }, 50);
      }
    },
    [addFaultNode, appendEvent, clearFaultById, edges, isolateFault]
  );

  const resetCondition = useCallback(
    (nodeId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== nodeId) return n;

          const md = getMimicData(n);
          const protection = (n.data as any)?.protection ?? {};

          const nextProtection = { ...protection, lockout: false };

          const nextMimic = md ? { ...md, moving: false } : (n.data as any)?.mimic;

          return {
            ...n,
            data: {
              ...(n.data as any),
              faulted: false,
              destroyed: false,
              protection: nextProtection,
              mimic: nextMimic,
            },
          };
        })
      );

      appendEvent("info", `RESET ${nodeId}`);
    },
    [appendEvent, getMimicData, setNodes]
  );

  return { activeFaultsOnBusbar, clearFaultById, createFaultOnEdge, resetCondition };
}
