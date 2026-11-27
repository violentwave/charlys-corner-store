"use client";
/**
 * The /account tabs (docs/02 Member perks): My designs, Sizes & rosters, Settings,
 * Security — addressed by the URL hash so links like /account#security land on the
 * right tab. Drafts and Brand kit are coming in P49-3 — add values here.
 */
import { startTransition, ViewTransition } from "react";
import { useEffect, useState } from "react";

import { MyDesigns } from "./my-designs";
import { SecuritySettings } from "./security-settings";
import { SettingsTab } from "./settings-tab";
import { SizeSets } from "./size-sets";
import { Drafts } from "./drafts";
import { BrandKitTab } from "./brand-kit-tab";
import { PaymentMethods } from "./payment-methods";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabFromHash = (hash: string) => {
  if (hash === "#security") return "security";
  if (hash === "#sizes") return "sizes";
  if (hash === "#settings") return "settings";
  if (hash === "#drafts") return "drafts";
  if (hash === "#brand") return "brand";
  if (hash === "#payments") return "payments";
  return "designs";
};

export function AccountTabs({ email }: { email: string }) {
  // Start on the default tab for SSR, then sync with the URL hash on mount.
  const [tab, setTab] = useState<"designs" | "drafts" | "brand" | "payments" | "sizes" | "settings" | "security">(
    "designs",
  );
  const [dir, setDir] = useState(1);

  const TAB_ORDER = ["designs", "drafts", "brand", "payments", "sizes", "settings", "security"] as const;
  useEffect(() => {
    const sync = () => {
      const next = tabFromHash(window.location.hash);
      setDir(TAB_ORDER.indexOf(next) >= TAB_ORDER.indexOf(tab) ? 1 : -1);
      setTab(next);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const v = value as "designs" | "drafts" | "brand" | "payments" | "sizes" | "settings" | "security";
        setDir(TAB_ORDER.indexOf(v) >= TAB_ORDER.indexOf(tab) ? 1 : -1);
        startTransition(() => setTab(v));
        history.replaceState(null, "", `#${value}`);
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

      <ViewTransition
        enter={dir > 0 ? "slide-in-right" : "slide-in-left"}
        exit={dir > 0 ? "slide-out-left" : "slide-out-right"}
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
