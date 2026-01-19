import { useCallback, useMemo, useState } from "react";
import type { Edge, Node } from "reactflow";

import type { EventCategory } from "../../components/EventLog";
import type { InterlockRule } from "../../components/modals/InterlockingModal";
import type { InterfaceMeta } from "../../components/modals/PowerFlowModal";
import { loadTemplateById, TEMPLATE_INDEX } from "../../templates/manifest";
import type { BayType, BP109Meta, LabelMode, LabelScheme } from "../labeling/bp109";
import { normalizeNodes } from "../util/normalizeNodes";

type TemplateProject = {
  metadata?: { title?: string; description?: string };
  nodes: Node[];
  edges: Edge[];
  labelScheme?: LabelScheme;
  labelMode?: LabelMode;
  labelOverrides?: Record<string, string>;
  bayTypeOverrides?: Record<string, BayType>;
  bp109MetaById?: Record<string, BP109Meta>;
  interlocks?: InterlockRule[];
  interfaceMetaById?: Record<string, InterfaceMeta>;
};

export function loadInitialProject(): TemplateProject {
  const defaultTemplateId = TEMPLATE_INDEX[0]?.id;
  if (!defaultTemplateId) {
    throw new Error("No templates found. Add JSON files under src/templates/templates/");
  }
  const parsed = loadTemplateById(defaultTemplateId);
  if (!parsed?.nodes || !parsed?.edges) {
    throw new Error(`Default template failed to load: ${defaultTemplateId}`);
  }
  return parsed as TemplateProject;
}

type UseTemplatesParams = {
  appendEvent: (category: EventCategory, msg: string, options?: { source?: "player" | "system" }) => void;
  bayTypeOverrides: Record<string, BayType>;
  bp109MetaById: Record<string, BP109Meta>;
  edges: Edge[];
  initialProject: TemplateProject;
  interlocks: InterlockRule[];
  labelMode: LabelMode;
  labelOverrides: Record<string, string>;
  labelScheme: LabelScheme;
  nodes: Node[];
  setBayTypeOverrides: React.Dispatch<React.SetStateAction<Record<string, BayType>>>;
  setBp109MetaById: React.Dispatch<React.SetStateAction<Record<string, BP109Meta>>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setInterlocks: React.Dispatch<React.SetStateAction<InterlockRule[]>>;
  setInterfaceMetaById: React.Dispatch<React.SetStateAction<Record<string, InterfaceMeta>>>;
  setLabelMode: React.Dispatch<React.SetStateAction<LabelMode>>;
  setLabelOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setLabelScheme: React.Dispatch<React.SetStateAction<LabelScheme>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
};

export function useTemplates({
  appendEvent,
  bayTypeOverrides,
  bp109MetaById,
  edges,
  initialProject,
  interlocks,
  labelMode,
  labelOverrides,
  labelScheme,
  nodes,
  setBayTypeOverrides,
  setBp109MetaById,
  setEdges,
  setInterlocks,
  setInterfaceMetaById,
  setLabelMode,
  setLabelOverrides,
  setLabelScheme,
  setNodes,
}: UseTemplatesParams) {
  const [saveTitle, setSaveTitle] = useState(
    initialProject?.metadata?.title ?? "Untitled Template"
  );
  const [saveDescription, setSaveDescription] = useState(
    initialProject?.metadata?.description ?? ""
  );

  const serializeProject = useCallback(
    () =>
      JSON.stringify(
        {
          schemaVersion: "1.0",
          metadata: { title: saveTitle, description: saveDescription },
          nodes,
          edges,
          labelScheme,
          labelMode,
          labelOverrides,
          bayTypeOverrides,
          bp109MetaById,
          interlocks,
        },
        null,
        2
      ),
    [
      bayTypeOverrides,
      bp109MetaById,
      edges,
      interlocks,
      labelMode,
      labelOverrides,
      labelScheme,
      nodes,
      saveDescription,
      saveTitle,
    ]
  );

  const onDownload = useCallback(() => {
    const json = serializeProject();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${saveTitle.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "mimic-template"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    appendEvent("debug", "Saved template JSON", { source: "player" });
  }, [appendEvent, saveTitle, serializeProject]);

  const onLoadFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.nodes || !parsed?.edges) {
        appendEvent("error", "Load failed: invalid file format");
        return;
      }
      setNodes(normalizeNodes(parsed.nodes));

      setEdges(parsed.edges);
      if (parsed?.metadata?.title) setSaveTitle(parsed.metadata.title);
      if (parsed?.metadata?.description) setSaveDescription(parsed.metadata.description);
      if (parsed.labelScheme) setLabelScheme(parsed.labelScheme);
      if (parsed.labelMode) setLabelMode(parsed.labelMode);
      if (parsed.labelOverrides) setLabelOverrides(parsed.labelOverrides);
      if (parsed.bayTypeOverrides) setBayTypeOverrides(parsed.bayTypeOverrides);
      if (parsed.bp109MetaById) setBp109MetaById(parsed.bp109MetaById);
      if (parsed.interlocks) setInterlocks(parsed.interlocks);
      appendEvent("debug", `Loaded ${file.name}`, { source: "player" });
    },
    [
      appendEvent,
      setBayTypeOverrides,
      setBp109MetaById,
      setEdges,
      setInterlocks,
      setLabelMode,
      setLabelOverrides,
      setLabelScheme,
      setNodes,
    ]
  );

  const templates = useMemo(
    () =>
      TEMPLATE_INDEX.map((t) => ({
        id: t.id,
        name: t.title,
        description: t.description,
        category: t.category,
      })),
    []
  );

  const onLoadTemplate = useCallback(
    (id: string) => {
      const parsed = loadTemplateById(id);
      if (!parsed?.nodes || !parsed?.edges) {
        appendEvent("error", `Template load failed: ${id}`);
        return;
      }

      setNodes(normalizeNodes(parsed.nodes));

      setEdges(parsed.edges);

      if (parsed?.metadata?.title) setSaveTitle(parsed.metadata.title);
      if (parsed?.metadata?.description) setSaveDescription(parsed.metadata.description);

      if (parsed.labelScheme) setLabelScheme(parsed.labelScheme);
      if (parsed.labelMode) setLabelMode(parsed.labelMode);
      if (parsed.labelOverrides) setLabelOverrides(parsed.labelOverrides);
      if (parsed.bayTypeOverrides) setBayTypeOverrides(parsed.bayTypeOverrides);
      if (parsed.bp109MetaById) setBp109MetaById(parsed.bp109MetaById);
      if (parsed.interlocks) setInterlocks(parsed.interlocks);
      if (parsed.interfaceMetaById) setInterfaceMetaById(parsed.interfaceMetaById);

      appendEvent("debug", `Loaded template: ${id}`, { source: "player" });
    },
    [
      appendEvent,
      setBayTypeOverrides,
      setBp109MetaById,
      setEdges,
      setInterlocks,
      setInterfaceMetaById,
      setLabelMode,
      setLabelOverrides,
      setLabelScheme,
      setNodes,
    ]
  );

  return {
    saveTitle,
    setSaveTitle,
    saveDescription,
    setSaveDescription,
    templates,
    onLoadFile,
    onLoadTemplate,
    onDownload,
  };
}
