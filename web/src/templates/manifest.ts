export type TemplateEntry = {
  id: string;          // derived from filename (without extension)
  title: string;       // from JSON metadata.title or fallback
  description: string; // from JSON metadata.description or fallback
  file: string;        // the relative glob key
};

type TemplateJson = {
  schemaVersion?: string;
  metadata?: { title?: string; description?: string };
  nodes?: any[];
  edges?: any[];
};

const modules = import.meta.glob("./templates/*.json", { eager: true }) as Record<string, any>;

function basenameNoExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.json$/i, "");
}

function normalizeTitle(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export const TEMPLATE_INDEX: TemplateEntry[] = Object.entries(modules)
  .map(([file, mod]) => {
    const json: TemplateJson = (mod?.default ?? mod) as TemplateJson;
    const id = basenameNoExt(file);
    const title = json?.metadata?.title ?? normalizeTitle(id);
    const description = json?.metadata?.description ?? "";
    return { id, title, description, file };
  })
  // deterministic order
  .sort((a, b) => a.title.localeCompare(b.title));

export function loadTemplateById(id: string): any | null {
  const entry = TEMPLATE_INDEX.find((t) => t.id === id);
  if (!entry) return null;
  const mod = modules[entry.file];
  return (mod?.default ?? mod) ?? null;
}
