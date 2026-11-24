"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ReferralFields } from "./referral-fields";
import { notifyFormsComingSoon } from "./form-notice";
import { referralSchema, type ReferralInput } from "@/lib/schemas";

export function ReferralSurvey() {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ReferralInput>({
    resolver: zodResolver(referralSchema),
    defaultValues: {},
  });

  const onSubmit = () => notifyFormsComingSoon();

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <ReferralFields control={control} errors={errors} />
      <div>
        <Button type="submit">Submit</Button>
      </div>
    </form>
  );
}
