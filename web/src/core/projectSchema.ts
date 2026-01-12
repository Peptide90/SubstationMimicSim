import { z } from 'zod';

export const SwitchStateSchema = z.union([z.literal('open'), z.literal('closed')]);

export const NodeKindSchema = z.union([
  z.literal('source'),
  z.literal('bus'),
  z.literal('cb'),
  z.literal('ds'),
  z.literal('es'),
  z.literal('load'),
  z.literal('xfmr'),
]);

export const MimicNodeSchema = z.object({
  id: z.string().min(1),
  kind: NodeKindSchema,
  label: z.string().optional(),
  tags: z.array(z.string()).optional(),
  state: SwitchStateSchema.optional(),
  sourceOn: z.boolean().optional(),
});

export const MimicEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const RuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('requires'),
    action: z.object({ nodeId: z.string(), to: SwitchStateSchema }),
    requires: z.array(z.object({ nodeId: z.string(), state: SwitchStateSchema })),
  }),
  z.object({
    type: z.literal('forbids'),
    action: z.object({ nodeId: z.string(), to: SwitchStateSchema }),
    forbids: z.array(z.object({ nodeId: z.string(), state: SwitchStateSchema })),
  }),
  z.object({
    type: z.literal('mutex'),
    nodes: z.array(z.string()).min(2),
  }),
]);

export const MimicProjectSchema = z.object({
  schemaVersion: z.literal('1.0'),
  nodes: z.array(MimicNodeSchema),
  edges: z.array(MimicEdgeSchema),
  rules: z.array(RuleSchema),
});

export type MimicProject = z.infer<typeof MimicProjectSchema>;
