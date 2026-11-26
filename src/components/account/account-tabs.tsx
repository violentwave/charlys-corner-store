"use client";
/**
 * The /account tabs (docs/02 Member perks): My designs, Sizes & rosters, Settings,
 * Security — addressed by the URL hash so links like /account#security land on the
 * right tab. Drafts and Brand kit are coming in P49-3 — add values here.
 */
import { useEffect, useState } from "react";

import { MyDesigns } from "./my-designs";
import { SecuritySettings } from "./security-settings";
import { SettingsTab } from "./settings-tab";
import { SizeSets } from "./size-sets";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabFromHash = (hash: string) => {
  if (hash === "#security") return "security";
  if (hash === "#sizes") return "sizes";
  if (hash === "#settings") return "settings";
  return "designs";
};

export function AccountTabs({ email }: { email: string }) {
  // Start on the default tab for SSR, then sync with the URL hash on mount.
  const [tab, setTab] = useState<"designs" | "sizes" | "settings" | "security">("designs");

  useEffect(() => {
    const sync = () => setTab(tabFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as "designs" | "sizes" | "settings" | "security");
        history.replaceState(null, "", `#${value}`);
      }}
    >
      <TabsList aria-label="Your account">
        <TabsTrigger value="designs">My designs</TabsTrigger>
        <TabsTrigger value="sizes">Sizes &amp; rosters</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      <TabsContent value="designs">
        <MyDesigns email={email} />
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
    </Tabs>
  );
}
