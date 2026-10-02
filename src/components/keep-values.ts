import { startTransition, type FormEvent } from "react";

/**
 * onSubmit for a form whose `action` comes from useActionState. React clears an uncontrolled form after
 * its action ran, so after an error everything typed would be gone, and after a save that does not
 * re-render the page the fields would jump back to the old values – and the next save would send those.
 * Dispatching the action from here keeps what is in the fields; the pending state works the same.
 * Before the page is hydrated (or without JavaScript) the form still posts to the action as usual.
 */
export function keepValues(dispatch: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(formData));
  };
}
