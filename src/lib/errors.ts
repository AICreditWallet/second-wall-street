/** Maps stable error codes raised by database functions to plain-language messages. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Please sign in to continue.",
  email_not_verified: "Please verify your email address first — check your inbox for the link.",
  rate_limited: "You've made a lot of changes today. Please try again tomorrow.",
  office_not_found: "That office doesn't exist.",
  office_unavailable: "Someone else has just claimed this office. Please pick another one.",
  premium_requires_subscription: "This is a premium office — choose monthly or one-time to rent it.",
  office_not_for_sale: "This office isn't for sale.",
  invalid_plan: "Choose monthly or one-time.",
  paid_office_use_billing: "This is a paid office. Cancel it from Manage billing instead.",
  organization_details_required: "Please name your organisation.",
  slug_reserved: "That web address is reserved. Please choose another.",
  slug_taken: "That web address is already taken. Please choose another.",
  organization_invalid: "Please check your organisation name and web address.",
  organization_suspended: "Your organisation is suspended. Contact support@secondwallstreet.com.",
  free_office_limit: "You already have a free office. Release it first to move somewhere else.",
  not_office_owner: "Only the office owner can do that.",
  agent_limit_reached: "You've reached your office's agent limit (1 on a free office, 10 on premium, 25 on landmark). Upgrade to a premium office for more.",
  office_required: "Claim an office before registering agents.",
  health_check_required: "Run a passing health check first — only healthy agents can be marked Live.",
  agent_suspended: "This agent is suspended by moderators.",
  agent_identity_locked: "An agent's web address and organisation can't be changed.",
  not_agent_owner: "Only the agent's owners can do that.",
  secret_invalid: "Tokens must be 8–500 characters.",
  connection_required: "Save the connection details first.",
  cannot_review_own: "You can't review your own organisation or its agents.",
  review_target_unavailable: "This listing can't be reviewed right now.",
  not_review_target_owner: "Only the owners can respond to this review.",
  not_moderator: "Only moderators can do that.",
};

export function friendlyError(error: { message?: string; code?: string } | null | undefined): string {
  const key = error?.message?.trim() ?? "";
  return MESSAGES[key] ?? "Something went wrong. Please try again.";
}
