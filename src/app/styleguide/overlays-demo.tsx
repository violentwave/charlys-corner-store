"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

export function OverlaysDemo() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Neon dialog</DialogTitle>
            <DialogDescription>A glass panel with a dimmed, blurred overlay.</DialogDescription>
          </DialogContent>
        </Dialog>

        <Button
          variant="secondary"
          onClick={() => toast({ title: "Saved", description: "Your changes are live.", variant: "success" })}
        >
          Success toast
        </Button>
        <Button
          variant="ghost"
          onClick={() => toast({ title: "Error", description: "Something went wrong.", variant: "error" })}
        >
          Error toast
        </Button>
        <Button variant="ghost" onClick={() => toast({ title: "Notice", description: "Here is some info." })}>
          Default toast
        </Button>
      </div>

      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
          <TabsTrigger value="three">Three</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Panel one content.</TabsContent>
        <TabsContent value="two">Panel two content.</TabsContent>
        <TabsContent value="three">Panel three content.</TabsContent>
      </Tabs>
    </div>
  );
}
