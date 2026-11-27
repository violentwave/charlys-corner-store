"use client";
/**
 * The /account tabs (docs/02 Member perks): My designs, Sizes & rosters, Settings,
 * Security — addressed by the URL hash so links like /account#security land on the
 * right tab. Drafts and Brand kit are coming in P49-3 — add values here.
 */
import { startTransition, useCallback, useEffect, useState, ViewTransition } from "react";

import { MyDesigns } from "./my-designs";
import { SecuritySettings } from "./security-settings";
import { SettingsTab } from "./settings-tab";
import { SizeSets } from "./size-sets";
import { Drafts } from "./drafts";
import { BrandKitTab } from "./brand-kit-tab";
import { PaymentMethods } from "./payment-methods";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AccountTab = "designs" | "drafts" | "brand" | "payments" | "sizes" | "settings" | "security";

/** Tab order on screen: the panel slides in the direction of travel (P52-3). */
const TAB_ORDER: AccountTab[] = ["designs", "drafts", "brand", "payments", "sizes", "settings", "security"];

const tabFromHash = (hash: string): AccountTab => {
  if (hash === "#security") return "security";
  if (hash === "#sizes") return "sizes";
  if (hash === "#settings") return "settings";
  if (hash === "#drafts") return "drafts";
  if (hash === "#brand") return "brand";
  if (hash === "#payments") return "payments";
  return "designs";
};

export function AccountTabs({ email }: { email: string }) {
  // Start on the default tab for SSR, then sync with the URL hash on mount. `dir` is the
  // direction of travel, so the panel enters from the side the visitor is heading towards.
  const [state, setState] = useState<{ tab: AccountTab; dir: 1 | -1 }>({ tab: "designs", dir: 1 });

  const select = useCallback((next: AccountTab) => {
    setState((current) =>
      current.tab === next
        ? current
        : { tab: next, dir: TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(current.tab) ? 1 : -1 },
    );
  }, []);

  useEffect(() => {
    const sync = () => select(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [select]);

  return (
    <Tabs
      value={state.tab}
      onValueChange={(value) => {
        history.replaceState(null, "", `#${value}`);
        startTransition(() => select(value as AccountTab));
      }}
    >
      {/* Six tabs: wrap onto two rows on phones instead of hiding some behind a sideways scroll. */}
      <TabsList aria-label="Your account" className="flex-wrap overflow-visible">
        <TabsTrigger value="designs">My designs</TabsTrigger>
        <TabsTrigger value="drafts">Drafts</TabsTrigger>
        <TabsTrigger value="brand">Brand kit</TabsTrigger>
        <TabsTrigger value="payments">Payment methods</TabsTrigger>
        <TabsTrigger value="sizes">Sizes &amp; rosters</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      {/* Keyed by the tab: the old panel leaves and the new one enters (4px slide + crossfade). */}
      <ViewTransition
        key={state.tab}
        enter={state.dir > 0 ? "slide-in-right" : "slide-in-left"}
        exit={state.dir > 0 ? "slide-out-left" : "slide-out-right"}
        default="none"
      >
        <TabsContent value="designs">
          <MyDesigns email={email} />
        </TabsContent>

        <TabsContent value="drafts">
          <Drafts />
        </TabsContent>

        <TabsContent value="brand">
          <BrandKitTab />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentMethods />
        </TabsContent>

        <TabsContent value="sizes">
          <SizeSets />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings email={email} />
        </TabsContent>
      </ViewTransition>
    </Tabs>
  );
}
