import { MimicProjectSchema } from './projectSchema';
import type { MimicProject } from './projectSchema';

export function serializeProject(project: MimicProject): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): MimicProject {
  const parsed = JSON.parse(json) as unknown;
  return MimicProjectSchema.parse(parsed);
}
