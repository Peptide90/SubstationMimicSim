/**
 * Minimal stand-ins for the React Flow `Node` / `Edge` types the quarantined
 * challenge content was written against. React Flow itself is no longer a
 * dependency; these exist only so this folder keeps type-checking until the
 * content is ported to the V2 document model. See README.md.
 */
export type Node<T = unknown> = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: T;
  draggable?: boolean;
  selectable?: boolean;
};

export type Edge<T = unknown> = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  style?: Record<string, unknown>;
  data?: T;
};
