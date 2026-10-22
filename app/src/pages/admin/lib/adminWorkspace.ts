export interface AdminWorkspaceTool {
  path: string;
  label: string;
  icon: string;
  description: string;
  keywords: string;
}

export const ADMIN_WORKSPACE_GROUPS: { label: string; tools: AdminWorkspaceTool[] }[] = [
  { label: "Workspace", tools: [
    { path: "/admin/accounts", label: "People & organizations", icon: "groups", description: "Organizations, teams and player records", keywords: "players athletes teams staff coaches directory contacts" },
  ] },
  { label: "Training", tools: [
    { path: "/admin/programs", label: "Planner", icon: "calendar_month", description: "Personalized plans and workout drafts", keywords: "training workouts prescribe programs" },
    { path: "/admin/drills", label: "Drill library", icon: "exercise", description: "Exercises, demonstrations and content", keywords: "catalog media videos publish exercises" },
  ] },
  { label: "Review tools", tools: [
    { path: "/admin/analysis", label: "Technique review", icon: "view_in_ar", description: "Recorded movement and reviewed analysis", keywords: "analysis reps evidence comparison" },
  ] },
  { label: "System & support", tools: [
    { path: "/admin/ai-incidents", label: "AI incidents", icon: "shield", description: "Review reported AI events", keywords: "incidents safety issues" },
    { path: "/admin/device-performance", label: "Device performance", icon: "devices", description: "Phones, processing and team sessions", keywords: "phone diagnostics processing performance devices" },
    { path: "/admin/user-issues", label: "User issues", icon: "bug_report", description: "Investigate reported application issues", keywords: "bugs reports support" },
    { path: "/admin/feedback", label: "App feedback", icon: "chat_bubble_outline", description: "Read feedback submitted through PoseTek", keywords: "survey responses comments" },
  ] },
  { label: "Account", tools: [
    { path: "/admin/access", label: "Account access", icon: "key", description: "Activation and account recovery", keywords: "access accounts recovery sign in activation" },
  ] },
];

export const ADMIN_WORKSPACE_TOOLS = ADMIN_WORKSPACE_GROUPS.flatMap(group => group.tools);

/** Search only this tool directory. It does not read or imply a global record index. */
export function findAdminTools(query: string): AdminWorkspaceTool[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return ADMIN_WORKSPACE_TOOLS.filter(tool => words.every(word => `${tool.label} ${tool.description} ${tool.keywords}`.toLocaleLowerCase().includes(word)));
}

export function adminWorkspaceContext(path: string): { title: string; section: string; icon: string } {
  if (path.startsWith("/insights")) return { title: "Overview", section: "Workspace", icon: "space_dashboard" };
  if (/^\/admin\/accounts\/player\//.test(path)) return { title: path.includes("/results/") ? "Player evidence" : "Player record", section: "People & organizations", icon: "person" };
  if (/^\/admin\/accounts\/coach\//.test(path)) return { title: "Coach record", section: "People & organizations", icon: "person" };
  for (const group of ADMIN_WORKSPACE_GROUPS) {
    const tool = group.tools.find(item => path === item.path || path.startsWith(`${item.path}/`));
    if (tool) return { title: tool.label, section: group.label, icon: tool.icon };
  }
  return { title: "Administration", section: "PoseTek", icon: "space_dashboard" };
}
