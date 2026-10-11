"use client";

import { useFormState, useFormStatus } from "react-dom";

/** What every server action returns so the form can show feedback. `secret` is shown once (e.g. a new access code). */
export type ActionState = { ok: boolean; message?: string; secret?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Submit({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

interface Props {
  action: FormAction;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  buttonClass?: string;
  className?: string;
  /** Ask the browser to confirm before submitting, for destructive actions. */
  confirm?: string;
}

export default function ActionForm({
  action, children, submitLabel, pendingLabel = "Working…", buttonClass = "button button-primary", className, confirm: confirmText,
}: Props) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <Submit label={submitLabel} pendingLabel={pendingLabel} className={buttonClass} />
      {state?.message && (
        <p className={state.ok ? "form-ok" : "form-error"} role={state.ok ? "status" : "alert"}>
          {state.message}
          {state.secret && <> <code className="secret">{state.secret}</code></>}
        </p>
      )}
    </form>
  );
}
