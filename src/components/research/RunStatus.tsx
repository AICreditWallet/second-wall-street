import { Badge } from "@/components/ui/badge";

const LABEL = {
  running: ["Running", "cyan"],
  awaiting_approval: ["Waiting for approval", "gold"],
  succeeded: ["Completed", "cyan"],
  failed: ["Failed", "muted"],
  cancelled: ["Cancelled", "muted"],
  skipped: ["Skipped", "muted"],
} as const;

export function RunStatusBadge({ status }: { status: keyof typeof LABEL }) {
  const [label, tone] = LABEL[status];
  return <Badge tone={tone}>{label}</Badge>;
}
