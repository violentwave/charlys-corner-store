import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";

import { cleanup } from "@testing-library/react";
import { ReferralFields } from "./referral-fields";
import type { ReferralInput } from "@/lib/schemas";

afterEach(() => cleanup());

describe("ReferralFields", () => {
  it("hides the Other field by default", () => {
    function Wrapper() {
      const {
        control,
        formState: { errors },
      } = useForm<ReferralInput>({ defaultValues: {} });
      return <ReferralFields control={control} errors={errors} />;
    }
    render(<Wrapper />);
    expect(screen.queryByLabelText(/If Other please specify/i)).not.toBeInTheDocument();
  });

  it("shows the Other field when other is the default", async () => {
    function Wrapper() {
      const {
        control,
        formState: { errors },
      } = useForm<ReferralInput>({
        defaultValues: { referralSource: "other" },
      });
      return <ReferralFields control={control} errors={errors} />;
    }
    render(<Wrapper />);
    expect(await screen.findByLabelText(/If Other please specify/i)).toBeInTheDocument();
  });
});
