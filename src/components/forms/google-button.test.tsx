import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleButton } from "./google-button";

const fetchMock = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("GoogleButton", () => {
  it("renders the Google-branded link to /api/auth/google/start when the provider is on", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ user: null, providers: { google: true } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleButton next="/account#security" />);
    const button = await screen.findByTestId("google-button");
    expect(button).toHaveAttribute("href", "/api/auth/google/start?next=%2Faccount%23security");
    expect(button).toHaveTextContent("Continue with Google");
    expect(screen.getByRole("separator", { name: "or" })).toBeInTheDocument();
  });

  it("is hidden when providers.google is false (no client configured — CI)", async () => {
    fetchMock.mockResolvedValue({ status: 200, json: async () => ({ user: null, providers: { google: false } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleButton next="/account" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("google-button")).toBeNull();
    expect(screen.queryByRole("separator", { name: "or" })).toBeNull();
  });

  it("is hidden when the fetch fails", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleButton next="/account" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("google-button")).toBeNull();
  });

  it("skips the fetch when the caller already knows the answer", async () => {
    render(<GoogleButton next="/account" googleEnabled={true} />);
    expect(screen.getByTestId("google-button")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
