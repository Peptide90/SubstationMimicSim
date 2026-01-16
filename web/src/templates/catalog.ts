export type TemplateCatalogEntry = {
  id: string;                 // filename without .json
  category?: string;          // e.g. "Examples", "Busbars", "Bays"
  order?: number;             // lower = earlier
  featured?: boolean;         // optional
  hidden?: boolean;           // optional
};

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  { id: "test-line-bay", category: "Examples", order: 10, featured: true },
  { id: "full-busbar-arrangement", category: "Busbars", order: 20, featured: true },

  // Add more entries as you create templates; anything not listed will still appear.
];
