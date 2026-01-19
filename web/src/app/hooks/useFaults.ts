import { useCallback, useEffect, useRef, useState } from "react";
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
  const faultsRef = useRef<Record<string, Fault>>({});

  useEffect(() => {
    faultsRef.current = faults;
  }, [faults]);

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
        faultsRef.current = next;
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

      const getAdjacentAutoIsolateDs = (cbId: string) => {
        const neighbors = new Set<string>();
        for (const e of edges) {
          if (e.source === cbId) neighbors.add(e.target);
          if (e.target === cbId) neighbors.add(e.source);
        }
        return Array.from(neighbors)
          .map((id) => nodeMap.get(id))
          .filter((n): n is Node => !!n)
          .filter((n) => {
            const md = getMimicData(n);
            if (md?.kind !== "ds") return false;
            const protection = (n.data as any)?.protection;
            if (protection?.autoIsolate !== true) return false;
            return md.state === "closed";
          });
      };

      const scheduleDarAttempt = (cbId: string, attempt: number, maxAttempts: number, deadTimeMs: number) => {
        appendEvent("warn", `DAR initiated on ${cbId} (attempt ${attempt}/${maxAttempts})`);

        setNodes((ns) =>
          ns.map((n) => {
            if (n.id !== cbId) return n;
            const cur = (n.data as any)?.protection ?? {};
            return { ...n, data: { ...(n.data as any), protection: { ...cur, darAttempt: attempt } } };
          })
        );

        window.setTimeout(() => {
          const stillActive = Object.values(faultsRef.current).some(
            (f) => f.id === fault.id && f.status === "active"
          );
          if (!stillActive) return;

          appendEvent("warn", `DAR RECLOSE attempt ${attempt} on ${cbId}`);
          scheduleSwitchCommand(cbId, "cb" as NodeKind, "closed");

          window.setTimeout(() => {
            const still = Object.values(faultsRef.current).some(
              (f) => f.id === fault.id && f.status === "active"
            );
            if (!still) return;

            appendEvent("error", `DAR TRIP on ${cbId} (attempt ${attempt})`);
            scheduleSwitchCommand(cbId, "cb" as NodeKind, "open");

            if (attempt === 2) {
              const dsNodes = getAdjacentAutoIsolateDs(cbId);
              if (dsNodes.length) {
                for (const ds of dsNodes) {
                  appendEvent("warn", `AUTO ISOLATION on ${ds.id} for ${cbId}`);
                  scheduleSwitchCommand(ds.id, "ds" as NodeKind, "open");
                }
              }
            }

            if (attempt >= maxAttempts) {
              appendEvent("error", `DAR LOCKOUT on ${cbId}`);
              setNodes((ns) =>
                ns.map((n) => {
                  if (n.id !== cbId) return n;
                  const cur = (n.data as any)?.protection ?? {};
                  return { ...n, data: { ...(n.data as any), protection: { ...cur, lockout: true } } };
                })
              );
              return;
            }

            scheduleDarAttempt(cbId, attempt + 1, maxAttempts, deadTimeMs);
          }, 250);
        }, deadTimeMs);
      };

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
          const deadTimeMs = prot.deadTimeMs ?? 5000;
          const maxAttempts = prot.attempts ?? 2;
          const attempt = (prot.darAttempt ?? 0) + 1;
          if (attempt <= maxAttempts) {
            scheduleDarAttempt(cbId, attempt, maxAttempts, deadTimeMs);
          }
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

      setFaults((m) => {
        const next = { ...m, [faultId]: fault };
        faultsRef.current = next;
        return next;
      });

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

          const nextProtection = { ...protection, lockout: false, darAttempt: 0 };

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
