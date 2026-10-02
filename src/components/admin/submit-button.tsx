"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "../ui";

/** Submit button of a plain server-action form: disabled while the action runs, so a double click does not run it twice. */
export function SubmitButton({ disabled, ...props }: Omit<ComponentProps<typeof Button>, "type">) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || disabled} {...props} />;
}
