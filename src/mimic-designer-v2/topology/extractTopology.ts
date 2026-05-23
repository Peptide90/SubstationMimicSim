import type { DrawingDocument } from '../drawing/model';
import { buildGraph } from './graph';
import { traceFromSources } from './energisation';
import { validateTopology } from './validation';
import type { TopologyGraph } from './types';

export interface DerivedTopology extends TopologyGraph {
  extractionVersion: 2;
  extractedAt: string;
  liveNodeIds: string[];
}

export function extractTopology(doc: DrawingDocument): DerivedTopology {
  const graph = buildGraph(doc);
  const warnings = validateTopology(doc, graph);
  const liveNodeIds = [...traceFromSources({ ...graph, warnings })];

  return {
    ...graph,
    warnings,
    extractionVersion: 2,
    extractedAt: new Date().toISOString(),
    liveNodeIds
  };
}
