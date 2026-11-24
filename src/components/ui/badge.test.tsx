import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its text for every variant", () => {
    const variants = ["neutral", "pink", "cyan", "yellow", "green"] as const;
    for (const variant of variants) {
      render(<Badge variant={variant}>{variant} badge</Badge>);
      expect(screen.getByText(`${variant} badge`)).toBeInTheDocument();
    }
  });
});
