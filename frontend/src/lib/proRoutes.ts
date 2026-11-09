/** Professional destinations now live in the AMASS Agent app — never deep-link to them from the consumer app. */
export const PRO_ROUTE_PREFIXES = [
  "/agent-dashboard",
  "/agent-plans",
  "/agent-score",
  "/agent-workspace",
  "/become-agent",
  "/agency",
  "/admin",
  "/submit-property",
  "/fixa/provider",
  "/fixa/apply",
  "/fixa/join",
  "/brand",
  "/agent/tasks",
  "/agent/listing",
  "/agent/listing-docs",
  "/agent/boost",
  "/agent/onboarding",
  "/agent/representations",
];

export function isProRoute(url: string): boolean {
  return PRO_ROUTE_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`));
}
