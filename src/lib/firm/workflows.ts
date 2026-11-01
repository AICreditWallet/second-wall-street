import type { WorkflowDef } from "./engine";

/** The workflows platform agents run. Only built-in agents can take part. */
export const WORKFLOWS: WorkflowDef[] = [
  {
    id: "open15-session",
    name: "Open15 opening-session research",
    description: "Scan the 9:30–9:45 ET window, analyse opening ranges and publish a research summary.",
    organizationSlug: "open15-ai",
    budgetUnits: 30,
    steps: [
      { key: "scan", kind: "agent", agentId: "agt-open15-scanner", timeoutMs: 15000 },
      { key: "opening-ranges", kind: "agent", agentId: "agt-open15-orb" },
      { key: "report", kind: "agent", agentId: "agt-lab-report-agent" },
    ],
  },
  {
    id: "research-firm",
    name: "Multi-agent research firm",
    description: "Research → Technical → Market Intelligence → Risk → your approval → Portfolio Research → Report.",
    organizationSlug: "research-lab",
    budgetUnits: 60,
    steps: [
      { key: "scan", kind: "agent", agentId: "agt-open15-scanner", timeoutMs: 15000 },
      { key: "research", kind: "agent", agentId: "agt-lab-research-analyst" },
      { key: "technical", kind: "agent", agentId: "agt-lab-technical-analyst" },
      { key: "market-intel", kind: "agent", agentId: "agt-lab-market-intelligence" },
      { key: "risk", kind: "agent", agentId: "agt-lab-risk-analyst" },
      { key: "approve", kind: "approval", prompt: "Review the risk analysis. Approve to let Portfolio Research and the Report Agent continue." },
      { key: "portfolio", kind: "agent", agentId: "agt-lab-portfolio-research" },
      { key: "report", kind: "agent", agentId: "agt-lab-report-agent" },
    ],
  },
];

export const workflowById = new Map(WORKFLOWS.map((w) => [w.id, w]));

/** Runs each person can start per 24 hours. The agents cost nothing to run; this keeps the database small. */
export const DAILY_RUN_QUOTA = 5;
