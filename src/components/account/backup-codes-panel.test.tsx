import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BackupCodesPanel } from "./backup-codes-panel";

afterEach(() => cleanup());

const CODES = [
  "ABCD-EFGH",
  "JKMN-PQRS",
  "TUVW-XYZ2",
  "3456-789A",
  "BCDF-GHJK",
  "MNPR-STUV",
  "WXYZ-2345",
  "6789-ABCD",
  "EFGH-JKMN",
  "PQRS-TUVW",
];

describe("BackupCodesPanel", () => {
  it("shows all ten codes in the grid", () => {
    render(<BackupCodesPanel codes={CODES} onDone={vi.fn()} />);
    const grid = screen.getByTestId("backup-codes-grid");
    expect(grid.children).toHaveLength(10);
    expect(grid).toHaveTextContent("ABCD-EFGH");
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
  });

  it("Done stays disabled until the member confirms they saved the codes", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<BackupCodesPanel codes={CODES} onDone={onDone} />);
    const done = screen.getByTestId("backup-codes-done");
    expect(done).toBeDisabled();
    await user.click(screen.getByTestId("backup-codes-saved"));
    expect(done).toBeEnabled();
    await user.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
