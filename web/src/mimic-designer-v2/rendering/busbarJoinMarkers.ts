import type { Point } from '../drawing/model';
import type { TopologyGraph } from '../topology/types';

export function busbarJoinMarkers(topology: TopologyGraph): Point[] {
  const joinKeys = new Set<string>();
  const joins: Point[] = [];

  topology.nodes.forEach((node) => {
    const busbarRefs = node.connectionPointRefs.filter((ref) => ref.includes('-cp-') || ref.includes(':tee:'));
    const uniqueBusbarIds = new Set(
      busbarRefs
        .map((ref) => ref.split(':tee:')[0])
        .map((ref) => ref.replace(/-cp-\d+$/, ''))
    );
    if (uniqueBusbarIds.size < 2) return;
    const key = `${node.position.x}:${node.position.y}`;
    if (joinKeys.has(key)) return;
    joinKeys.add(key);
    joins.push(node.position);
  });

  return joins;
}
