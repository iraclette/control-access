"use client";

import { use } from "react";
import StaffShell from "@/components/staff/StaffShell";
import HotspotEditor from "@/components/staff/HotspotEditor";

export default function StaffViewEditorPage({ params }: PageProps<"/[lang]/staff/views/[id]">) {
  const { id } = use(params);
  return <StaffShell>{() => <HotspotEditor viewId={id} />}</StaffShell>;
}
