import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileField } from "./file-field";

const createObjectURL = vi.fn(() => "blob:preview");
const revokeObjectURL = vi.fn();

vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FileField", () => {
  it("rejects files over 20 MB inline", () => {
    const onChange = vi.fn();
    render(<FileField name="file" label="Artwork" files={[]} onChange={onChange} />);
    const input = screen.getByLabelText("Artwork") as HTMLInputElement;
    const big = new File(["x".repeat(10)], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/larger than 20 MB/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("revokes image previews on change", () => {
    const onChange = vi.fn();
    const file = new File(["x"], "a.png", { type: "image/png" });
    const { rerender } = render(<FileField name="file" label="Artwork" files={[]} onChange={onChange} />);
    rerender(<FileField name="file" label="Artwork" files={[file]} onChange={onChange} />);
    expect(createObjectURL).toHaveBeenCalled();
    rerender(<FileField name="file" label="Artwork" files={[]} onChange={onChange} />);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
