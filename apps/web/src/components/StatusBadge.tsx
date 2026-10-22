"use client";

import { useI18n } from "@/i18n/client";
import type { FlatStatus } from "@/lib/site";

const STYLES: Record<FlatStatus, string> = {
  available: "border-available text-available",
  reserved: "border-reserved text-reserved",
  sold: "border-sold text-sold line-through decoration-1",
};

export default function StatusBadge({ status }: { status: FlatStatus }) {
  const { dict } = useI18n();
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {dict.flat.status[status]}
    </span>
  );
}
