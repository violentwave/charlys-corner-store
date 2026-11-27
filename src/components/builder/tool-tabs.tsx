"use client";
/**
 * Step 3 tool tabs, below lg (P51-1): the same inspector sections as the desktop panel,
 * in four tabs under the sticky canvas — Item (selected layer), Add, Side, Layers. One
 * implementation: the panels are the extracted sections from design-inspector.tsx, not
 * forks. Selecting/adding a layer lands on Item; deselecting lands on Add; the Layers
 * tab only exists at 1+ layers (badge = the count). The panel scrolls inside itself
 * (max-height from --canvas-h and --chrome-h, set by the builder) so the page never
 * moves. Arrow keys follow the WAI-ARIA tabs pattern (Radix Tabs).
 */
import { startTransition, ViewTransition } from "react";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";

import { AddButtons, SelectedItemSection, SideSection, type InspectorSectionsProps } from "./design-inspector";
import { LayersPanel } from "./layers-panel";

type ToolTab = "item" | "add" | "side" | "layers";

/** Tab order on screen: the panel slides in the direction of travel (P52-3). */
const TAB_ORDER: ToolTab[] = ["item", "add", "side", "layers"];

export interface ToolTabsProps extends InspectorSectionsProps {
  fileError: string | null;
  onDropFile: (file: File) => void;
  accountEmail: string | null;
  /** Notices + step navigation, rendered above the tabs (inside the fixed shell). */
  top?: React.ReactNode;
}

const triggerClass =
  "focus-visible:ring-neon-cyan focus-visible:ring-offset-bg-0 data-[state=active]:bg-bg-3 data-[state=active]:text-neon-cyan data-[state=active]:shadow-glow-cyan text-text-2 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

export function ToolTabs(props: ToolTabsProps) {
  const { viewState } = props;
  const layerCount = viewState.layers.length;

  // Selecting or adding a layer lands on Item; deselecting lands on Add. Derived during
  // render ("adjust state during render") so the tab flips on the same render, not a tick
  // later — the builder's own lock-ratio state uses the same pattern.
  // Exemptions: a side switch resets the selection as a side effect (the visitor stays in
  // the Side tab), and while managing the Layers list, duplicate/delete move the
  // selection themselves (duplicate selects the copy) — yanking the visitor to Item would
  // make the list unusable. At 0 layers the Layers tab ceases to exist → Add.
  const [tab, setTab] = useState<ToolTab>(viewState.selectedLayerId ? "item" : "add");
  const [dir, setDir] = useState<1 | -1>(1);
  const [lastSelection, setLastSelection] = useState<string | null>(viewState.selectedLayerId);
  const [lastView, setLastView] = useState(props.view.id);
  if (layerCount === 0 && tab === "layers") {
    setTab("add");
  } else if (lastSelection !== viewState.selectedLayerId || lastView !== props.view.id) {
    const viewChanged = lastView !== props.view.id;
    setLastSelection(viewState.selectedLayerId);
    setLastView(props.view.id);
    if (!viewChanged && tab !== "layers") setTab(viewState.selectedLayerId ? "item" : "add");
  }

  const fileByIndex = new Map(props.files.map((f) => [f.index, f]));
  const rows = [...viewState.layers].reverse().map((layer) => ({
    id: layer.id,
    type: layer.type,
    name:
      layer.type === "text"
        ? layer.text.slice(0, 20) || "Text"
        : (fileByIndex.get(layer.fileIndex)?.name ?? layer.name),
    thumbUrl: layer.type === "image" ? fileByIndex.get(layer.fileIndex)?.url : undefined,
  }));

  return (
    <div
      className="bg-bg-0 fixed inset-x-0 top-[calc(4rem+var(--canvas-h)+1rem)] bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex flex-col px-4 pt-1"
      data-testid="artwork-controls"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) props.onDropFile(file);
      }}
    >
      {/* Notices + step pills live here on mobile (the flow copy is display:none). */}
      {props.top}

      {props.fileError ? (
        <p role="alert" aria-live="polite" className="text-danger flex items-center gap-1.5 text-xs">
          <span aria-hidden="true">⚠</span>
          {props.fileError}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as ToolTab;
          setDir(TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(tab) ? 1 : -1);
          startTransition(() => setTab(next));
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Sits right under the fixed canvas (top = header + canvas + the wrapper's
            pb-4); the panel below scrolls inside itself, so the page never moves. */}
        <div className="bg-bg-0 z-20 pt-1 pb-1">
          <TabsList aria-label="Design tools" className="p-1">
            <TabsTrigger value="item" data-testid="tool-tab-item" className={cn(triggerClass, "w-11")}>
              <span aria-hidden="true" className="text-sm leading-none">
                ✥
              </span>
              Item
            </TabsTrigger>
            <TabsTrigger value="add" data-testid="tool-tab-add" className={triggerClass}>
              <span aria-hidden="true" className="text-sm leading-none">
                ＋
              </span>
              Add
            </TabsTrigger>
            <TabsTrigger value="side" data-testid="tool-tab-side" className={triggerClass}>
              <span aria-hidden="true" className="text-sm leading-none">
                ⇄
              </span>
              Side
            </TabsTrigger>
            {layerCount > 0 ? (
              <TabsTrigger value="layers" data-testid="tool-tab-layers" className={triggerClass}>
                <span aria-hidden="true" className="text-sm leading-none">
                  ☰
                </span>
                Layers
                <span
                  aria-hidden="true"
                  data-testid="layers-count"
                  className="bg-neon-cyan/15 text-neon-cyan rounded-full px-1.5 py-px font-mono text-[10px]"
                >
                  {layerCount}
                </span>
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        {/* The active panel scrolls inside itself; the page (and the sticky canvas) stay put. */}
        <ViewTransition
          key={tab}
          enter={dir > 0 ? "slide-in-right" : "slide-in-left"}
          exit={dir > 0 ? "slide-out-left" : "slide-out-right"}
          default="none"
        >
          <TabsContent
            value="item"
            className="border-border mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md pr-1"
          >
            <div className="flex flex-col gap-3">
              <SelectedItemSection {...props} />
              {props.accountEmail ? (
                <p className="text-text-3 text-xs" data-testid="signed-in-as">
                  Signed in as <span className="text-text-2">{props.accountEmail}</span>
                </p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent
            value="add"
            className="border-border mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md pr-1"
          >
            <div className="flex flex-col gap-2">
              <AddButtons
                capReached={props.capReached}
                logo={props.logo}
                onUploadClick={props.onUploadClick}
                onAddText={props.onAddText}
                onAddLogo={props.onAddLogo}
              />
              {props.capReached ? (
                <p className="text-text-3 text-xs" role="note" data-testid="layers-cap">
                  This side holds 8 designs — remove one to add another.
                </p>
              ) : null}
              {props.accountEmail ? (
                <p className="text-text-3 text-xs" data-testid="signed-in-as">
                  Signed in as <span className="text-text-2">{props.accountEmail}</span>
                </p>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent
            value="side"
            className="border-border mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md pr-1"
          >
            <SideSection {...props} />
          </TabsContent>

          {layerCount > 0 ? (
            <TabsContent
              value="layers"
              className="border-border mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md pr-1"
            >
              <LayersPanel
                rows={rows}
                selectedId={viewState.selectedLayerId}
                onSelect={props.onSelectLayer}
                onMove={props.onMoveLayer}
                onDuplicate={props.onDuplicateLayer}
                onRemove={props.onRemoveLayer}
              />
            </TabsContent>
          ) : null}
        </ViewTransition>
      </Tabs>
    </div>
  );
}
