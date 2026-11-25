"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { postJson, NETWORK_ERROR } from "@/components/forms/auth-post";

/** Signs the visitor out (POST /api/auth/logout), then heads home. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLogout = async () => {
    setPending(true);
    setError(null);
    const { data: res } = await postJson("/api/auth/logout");
    if (res?.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    setPending(false);
    setError(res && !res.ok ? res.error : NETWORK_ERROR);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={onLogout} data-testid="logout">
        Log out
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
