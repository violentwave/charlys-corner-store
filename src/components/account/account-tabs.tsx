"use client";
/**
 * The /account tabs (docs/02 Members v2): My designs (default) and Security. The tab
 * lives in the URL hash (#designs / #security) so links like /account#security land on
 * the right tab. Drafts and Brand kit tabs are coming in P49-2 — add values here.
 */
import { useEffect, useState } from "react";

import { MyDesigns } from "./my-designs";
import { SecuritySettings } from "./security-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabFromHash = (hash: string) => (hash === "#security" ? "security" : "designs");

export function AccountTabs({ email }: { email: string }) {
  // Start on the default tab for SSR, then sync with the URL hash on mount.
  const [tab, setTab] = useState<"designs" | "security">("designs");

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
        setTab(value as "designs" | "security");
        history.replaceState(null, "", `#${value}`);
      }}
    >
      <TabsList aria-label="Your account">
        <TabsTrigger value="designs">My designs</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      <TabsContent value="designs">
        <MyDesigns />
      </TabsContent>

      <TabsContent value="security">
        <SecuritySettings email={email} />
      </TabsContent>
    </Tabs>
  );
}
