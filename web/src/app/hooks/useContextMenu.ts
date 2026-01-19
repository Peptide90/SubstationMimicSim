import { useCallback, useState } from "react";
import type { Edge, Node } from "reactflow";

import type { CtxMenu } from "../../components/ContextMenu";
import type { NodeKind } from "../../core/model";

type UseContextMenuParams = {
  edges: Edge[];
  nodeById: Map<string, Node>;
  getNodeKind: (node: Node) => NodeKind | null;
};

export function useContextMenu({ edges, nodeById, getNodeKind }: UseContextMenuParams) {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);

  const onEdgeContextMenu = useCallback((edge: Edge, pos: { x: number; y: number }) => {
    if ((edge.data as any)?.kind !== "busbar") return;
    setCtxMenu({ kind: "edge", edgeId: edge.id, x: pos.x, y: pos.y });
  }, []);

  const onNodeContextMenu = useCallback((node: Node, pos: { x: number; y: number }) => {
    setCtxMenu({ kind: "node", nodeId: node.id, x: pos.x, y: pos.y });
  }, []);

  const onPaneContextMenu = useCallback((_pos: { x: number; y: number }) => {
    setCtxMenu(null);
  }, []);

  const onPaneClick = useCallback(() => setCtxMenu(null), []);

  const getEdgeById = useCallback((id: string) => edges.find((e) => e.id === id), [edges]);
  const getNodeById = useCallback((id: string) => nodeById.get(id), [nodeById]);

  const getNodeKindForMenu = useCallback((node: Node) => getNodeKind(node), [getNodeKind]);

  return {
    ctxMenu,
    onEdgeContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
    onPaneClick,
    getEdgeById,
    getNodeById,
    getNodeKind: getNodeKindForMenu,
  };
}
