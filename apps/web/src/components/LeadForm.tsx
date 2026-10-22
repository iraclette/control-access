"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";

type Props = {
  projectId?: string;
  flatId?: string;
  subject?: string; // shown above the form, e.g. "Flat 12, Gori Residence II"
};

type ErrorCode = "rate_limited" | "invalid_fields" | "send_failed" | "network" | "generic";

export default function LeadForm({ projectId, flatId, subject }: Props) {
  const { lang, dict } = useI18n();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<ErrorCode | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          email: form.get("email"),
          message: form.get("message"),
          // Honeypot: real visitors never see or fill this field.
          website: form.get("website"),
          projectId,
          flatId,
          locale: lang,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: ErrorCode };
        setError(body.code ?? "generic");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("network");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-xl border border-available bg-surface p-4 text-sm">
        {dict.contact.sent}
      </p>
    );
  }

  const input = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {subject && <p className="text-sm text-muted">{fmt(dict.contact.about, { subject })}</p>}
      <label className="block space-y-1 text-sm">
        <span>{dict.contact.name}</span>
        <input name="name" required maxLength={200} autoComplete="name" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{dict.contact.phone}</span>
        <input name="phone" type="tel" required maxLength={40} autoComplete="tel" inputMode="tel" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{dict.contact.email}</span>
        <input name="email" type="email" maxLength={254} autoComplete="email" className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{dict.contact.message}</span>
        <textarea name="message" rows={4} maxLength={3000} className={input} />
      </label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {dict.errors[error]}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-60"
      >
        {state === "sending" ? dict.contact.sending : dict.contact.send}
      </button>
    </form>
  );
}
