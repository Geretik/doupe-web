"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "../ui";

/**
 * Submit button of a plain server-action form: disabled while the action runs, so a double click does not run it twice.
 * With `confirmText` the form is submitted only after the admin confirms it.
 */
export function SubmitButton({
  disabled,
  confirmText,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Button>, "type"> & { confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      onClick={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
        else onClick?.(e);
      }}
      {...props}
    />
  );
}
