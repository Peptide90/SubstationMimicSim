import { useState } from "react";
import type { CSSProperties } from "react";
import type { Node } from "reactflow";

export type FaultSeverity = "normal" | "severe" | "extreme";

export type CtxMenu =
  | null
  | { kind: "edge"; edgeId: string; x: number; y: number }
  | { kind: "node"; nodeId: string; x: number; y: number };

export function ContextMenu(props: {
  ctxMenu: CtxMenu;
  onClose: () => void;

  getNodeById: (id: string) => Node | undefined;
  getNodeKind: (n: Node) => string | null;
  getBusbarIdForEdgeId: (edgeId: string) => string | null;

  hasActivePersistentFaultOnBusbar: (busbarId: string) => boolean;

  onCreateFaultOnEdge: (edgeId: string, screenPos: { x: number; y: number }, persistent: boolean, severity: FaultSeverity) => void;
  onClearPersistentFaultOnBusbar: (busbarId: string) => void;

  onToggleDar: (cbNodeId: string) => void;
  onToggleAutoIsolate: (dsNodeId: string) => void;
  onResetCondition: (nodeId: string) => void;
}) {
  const {
    ctxMenu,
    onClose,
    getNodeById,
    getNodeKind,
    getBusbarIdForEdgeId,
    hasActivePersistentFaultOnBusbar,
    onCreateFaultOnEdge,
    onClearPersistentFaultOnBusbar,
    onToggleDar,
    onToggleAutoIsolate,
    onResetCondition,
  } = props;

  const [faultMenuOpen, setFaultMenuOpen] = useState(false);

  if (!ctxMenu) return null;

  const menuBtnStyle: CSSProperties = {
    width: "100%",
    textAlign: "left",
    background: "#0f172a",
    border: "1px solid #334155",
    color: "#fff",
    padding: "6px 8px",
    borderRadius: 6,
    cursor: "pointer",
    marginBottom: 6,
    fontSize: 13,
  };

  const subBtnStyle: CSSProperties = {
    ...menuBtnStyle,
    marginLeft: 10,
    width: "calc(100% - 10px)",
  };

  // Lookups (no hooks)
  const busbarId = ctxMenu.kind === "edge" ? getBusbarIdForEdgeId(ctxMenu.edgeId) : null;
  const canClearPersistent = busbarId ? hasActivePersistentFaultOnBusbar(busbarId) : false;

  const node = ctxMenu.kind === "node" ? getNodeById(ctxMenu.nodeId) : undefined;
  const nodeKind = node ? getNodeKind(node) : null;

  const darEnabled = nodeKind === "cb" ? ((node?.data as any)?.protection?.dar === true) : false;
  const autoIsolateEnabled = nodeKind === "ds" ? ((node?.data as any)?.protection?.autoIsolate === true) : false;

  return (
    <div
      style={{
        position: "fixed",
        left: ctxMenu.x,
        top: ctxMenu.y,
        background: "#0b1220",
        border: "1px solid #334155",
        borderRadius: 8,
        padding: 8,
        zIndex: 100000,
        minWidth: 260,
        color: "#fff",
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 900, marginBottom: 8 }}>
        {ctxMenu.kind === "edge" ? "Busbar" : "Device"}
      </div>

      {ctxMenu.kind === "edge" && (
        <>
          <button style={menuBtnStyle} onClick={() => setFaultMenuOpen((v) => !v)}>
            Fault {faultMenuOpen ? "▾" : "▸"}
          </button>

          {faultMenuOpen && (
            <>
              <button
                style={subBtnStyle}
                onClick={() => {
                  onCreateFaultOnEdge(ctxMenu.edgeId, { x: ctxMenu.x, y: ctxMenu.y }, false, "normal");
                  onClose();
                }}
              >
                Transient fault (normal)
              </button>
			
              <button
                style={subBtnStyle}
                onClick={() => {
                  onCreateFaultOnEdge(ctxMenu.edgeId, { x: ctxMenu.x, y: ctxMenu.y }, true, "normal");
                  onClose();
                }}
              >
                Persistent fault (normal)
              </button>

              <button
                style={subBtnStyle}
                onClick={() => {
                  onCreateFaultOnEdge(ctxMenu.edgeId, { x: ctxMenu.x, y: ctxMenu.y }, true, "severe");
                  onClose();
                }}
              >
                Persistent fault (severe)
              </button>

              <button
                style={subBtnStyle}
                onClick={() => {
                  onCreateFaultOnEdge(ctxMenu.edgeId, { x: ctxMenu.x, y: ctxMenu.y }, true, "extreme");
                  onClose();
                }}
              >
                Persistent fault (extreme)
              </button>
            </>
          )}

          {busbarId && canClearPersistent && (
            <button
              style={menuBtnStyle}
              onClick={() => {
                onClearPersistentFaultOnBusbar(busbarId);
                onClose();
              }}
            >
              Clear persistent fault(s)
            </button>
          )}
        </>
      )}

      {ctxMenu.kind === "node" && nodeKind && (
        <>
          {nodeKind === "cb" && (
            <button
              style={menuBtnStyle}
              onClick={() => {
                onToggleDar(ctxMenu.nodeId);
                onClose();
              }}
            >
              DAR: {darEnabled ? "ON" : "OFF"}
            </button>
          )}

          {nodeKind === "ds" && (
            <button
              style={menuBtnStyle}
              onClick={() => {
                onToggleAutoIsolate(ctxMenu.nodeId);
                onClose();
              }}
            >
              Auto isolation: {autoIsolateEnabled ? "ON" : "OFF"}
            </button>
          )}

          {(nodeKind === "cb" || nodeKind === "ds" || nodeKind === "tx") && (
            <button
              style={menuBtnStyle}
              onClick={() => {
                onResetCondition(ctxMenu.nodeId);
                onClose();
              }}
            >
              Reset condition
            </button>
          )}

          {!(nodeKind === "cb" || nodeKind === "ds" || nodeKind === "tx") && (
            <div style={{ color: "#94a3b8", fontSize: 12 }}>No actions for {nodeKind.toUpperCase()} yet</div>
          )}
        </>
      )}

      {ctxMenu.kind === "node" && !nodeKind && <div style={{ color: "#94a3b8", fontSize: 12 }}>Node not found</div>}

      <div style={{ borderTop: "1px solid #1f2937", marginTop: 8, paddingTop: 8 }}>
        <button style={menuBtnStyle} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
