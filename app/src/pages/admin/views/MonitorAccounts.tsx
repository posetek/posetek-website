import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { loadPlayer, PLAYER_INDEX_LIMIT, resolvePlayerAge } from "../lib/accounts";
import type { CoachRow, OrganizationRow, PlayerRow } from "../lib/accounts";
import { hasClubIdentity, legacyCoachGroups, staffName } from "../lib/accountHierarchy";
import type { AccountContext, HierarchyTeam } from "../lib/accountHierarchy";
import { useAccountLoad } from "../lib/useAccountLoad";
import { directorySession } from "../lib/directoryRetention";
import { directoryCoachPath, directoryPage, directoryPlayers, directorySource, unassignedDirectoryPlayers } from "../lib/adminDirectory";
import type { DirectoryRoster, DirectorySource } from "../lib/adminDirectory";
import { adminDirectoryPath, adminPlayerPath, directoryLevelOf, directoryWorkspacePaneOf, parseAdminDirectoryState, selectDirectoryScope, supportsOnePagerTracking, withWorkspaceReport, workspaceReportRequest, workspaceReportSearch } from "../lib/adminNavigation";
import type { AdminDirectoryState } from "../lib/adminNavigation";
import PlayerRosterRow, { AccountAvatar } from "./PlayerRosterRow";
import SignupStatus from "./SignupStatus";
import DirectoryManagement, { DirectoryPlayerActions } from "./DirectoryManagement";
import { insightsLink } from "../../insights/lib/navigation";
import PlayerFilters from "../../insights/PlayerFilters";
import { clearPlayerFilters, hasPlayerFilters } from "../../insights/lib/expandedQuery";
import type { ExpandedRequest } from "../../insights/lib/expandedQuery";
import type { ExpandedPlayer, InsightScope } from "../../insights/lib/expanded";
import { setWorkspaceMetricsScope, useWorkspaceMetrics } from "../lib/workspaceMetrics";
import { WorkspaceAttention, WorkspaceMetricCells, WorkspaceReportControls, WorkspaceReportDetails, WorkspaceScopeHeader } from "./WorkspaceReporting";
import type { WorkspaceMetricState, WorkspacePlayerMetric } from "./WorkspaceReporting";
import DirectoryNavigator, { TeamDirectory } from "./DirectoryNavigator";
import { DirectoryFilters, DirectoryPlayerFilters, DirectoryWorkspaceTabs } from "./DirectoryWorkspaceControls";
import AdminActivityReport from "./AdminActivityReport";
import OnePagerTracking from "./OnePagerTracking";
import AdminTabs from "./AdminTabs";
import "./admin-directory.scss";
import "./admin-directory-lightning.scss";

const tabs = [["players", "Players"], ["staff", "Staff"], ["teams", "Manage teams"], ["settings", "Organization settings"]] as const;
type ChooseDirectory = (patch: Partial<AdminDirectoryState>, replace?: boolean) => void;

/** Lookup and management are deliberately separate mounts from organization browsing. */
export default function MonitorAccounts({ source = directorySource }: { source?: DirectorySource }) {
  const session = directorySession(source);
  const { state: organizations, refresh } = useAccountLoad(source.organizations, session.organizations());
  const [query, setQuery] = useSearchParams();
  const state = parseAdminDirectoryState(query);
  session.selectOrganization(state.orgId);
  useEffect(() => {
    setWorkspaceMetricsScope(state.orgId ? state.teamId ? { kind: "team", organizationId: state.orgId, teamId: state.teamId } : { kind: "organization", organizationId: state.orgId } : { kind: "global" });
  }, [state.orgId, state.teamId, session]);
  useEffect(() => () => { setWorkspaceMetricsScope(null); session.clearAll(false); }, [session]);
  const choose = (patch: Partial<AdminDirectoryState>, replace = false) => {
    const target = adminDirectoryPath({ ...state, ...patch });
    setQuery(new URLSearchParams(target.split("?")[1] || ""), { replace });
  };
  // Keep stale links and alternate data sources inside the current organization format.
  const available = organizations.kind === "ready" ? organizations.data.filter(org => org.schemaVersion === 2) : [];
  const selected = available.find(org => org.id === state.orgId);
  const navigateScope: ChooseDirectory = patch => choose(selectDirectoryScope(state, patch));
  const navigator = <DirectoryNavigator organizations={available} state={state} choose={navigateScope} pending={organizations.kind === "loading"} error={organizations.kind === "error" ? organizations.message : ""} retry={refresh} />;
  useEffect(() => { document.title = "People & organizations | PoseTek admin"; }, []);
  return <div className="admin-directory">
    <section className="admin-heading"><div><h1>People & organizations</h1><p>Find your organization, open a team and work with its people. Reporting stays one tab away.</p></div>
      <div className="admin-heading-actions"><button className="quiet-button" aria-label="Refresh organizations" onClick={refresh}>Refresh</button></div></section>
    <DirectoryTabs active={state.directoryTab} onChange={directoryTab => choose({ directoryTab, page: 1 })} />
    {selected && state.directoryTab === "players" ? <OrganizationPlayers key={selected.id} org={selected} organizations={available} state={state} choose={choose} navigateScope={navigateScope} source={source} /> : <DirectoryFrame navigator={navigator} state={state}>
        {state.orgId && organizations.kind === "ready" && !selected ? <p className="form-message" role="alert">That organization is no longer available. Choose a current organization.</p>
          : selected ? <>
            <div className="directory-scope-title"><h2>{selected.name}</h2>{selected.schemaVersion !== 2 && <span className="admin-chip">Legacy</span>}</div>
            {state.directoryTab === "staff" && <p className="admin-note">Staff access is organization-wide. Team assignments are shown for each coach; the Players team selection does not filter staff.</p>}
            {state.directoryTab !== "players" && selected.schemaVersion === 2 && <DirectoryManagement key={`${selected.id}:${state.directoryTab}`} org={selected} tab={state.directoryTab} state={state} choose={navigateScope} source={source} onOrganizationsChanged={refresh} />}
            {state.directoryTab !== "players" && selected.schemaVersion !== 2 && <LegacyStaff key={selected.id} organization={selected} source={source} state={state} />}
          </> : !state.orgId && <>
            {state.directoryTab === "players" && <PlayerLookup source={source} state={state} choose={choose} navigateScope={navigateScope} canonicalOrganizationIds={available.filter(org => org.schemaVersion === 2).map(org => org.id)} />}
            {state.directoryTab === "staff" && <IndependentStaff source={source} organizations={available} state={state} />}
            {state.directoryTab === "teams" && <p className="admin-empty">Choose an organization to view its teams.</p>}
            {state.directoryTab === "settings" && <DirectoryManagement tab="settings" state={state} choose={navigateScope} source={source} onOrganizationsChanged={refresh} />}
          </>}
    </DirectoryFrame>}
      {tabs.filter(([id]) => id !== state.directoryTab).map(([id]) => <section key={id} id={`directory-panel-${id}`} role="tabpanel" aria-labelledby={`directory-tab-${id}`} hidden />)}
  </div>;
}

function DirectoryFrame({ navigator, state, children }: { navigator: ReactNode; state: AdminDirectoryState; children: ReactNode }) {
  return <div className="directory-layout">{navigator}<section className="directory-content" id={`directory-panel-${state.directoryTab}`} role="tabpanel" aria-labelledby={`directory-tab-${state.directoryTab}`}>{children}</section></div>;
}

/** In-page section jumps retain this mounted scope, its private reads and browser history. */
export function jumpToDirectorySection(event: Pick<MouseEvent<HTMLAnchorElement>, "preventDefault">, id: string) {
  event.preventDefault();
  const target = document.getElementById(id);
  target?.scrollIntoView({ block: "start", behavior: "auto" });
  target?.focus({ preventScroll: true });
}

export function DirectoryTabs({ active, onChange }: { active: AdminDirectoryState["directoryTab"]; onChange(tab: AdminDirectoryState["directoryTab"]): void }) {
  return <AdminTabs className="directory-tabs" label="People and organization views" idPrefix="directory" tabs={tabs} active={active} onChange={onChange} />;
}

function OrganizationPlayers({ org, organizations, state, choose, navigateScope, source }: { org: OrganizationRow; organizations: OrganizationRow[]; state: AdminDirectoryState; choose: ChooseDirectory; navigateScope: ChooseDirectory; source: DirectorySource }) {
  const loader = useCallback(() => source.roster(org), [org, source]);
  const { state: loaded, previousData, refresh } = useAccountLoad(loader, directorySession(source).roster(org));
  const directoryReady = loaded.kind === "ready";
  const roster = loaded.kind === "ready" ? loaded.data : loaded.kind === "loading" ? previousData : null;
  const identityScope = roster ? organizationPeopleScope(org, roster, state) : null;
  const team = identityScope?.team;
  const teamValid = identityScope?.valid ?? !state.teamId;
  const people = directoryLevelOf(state) === "people";
  const unassigned = identityScope?.unassigned || false;
  const selectedRows = identityScope?.players || [];
  const rows = directoryPlayers(selectedRows, state.search);
  const scope: InsightScope | null = org.schemaVersion !== 2 || !roster?.context || !teamValid ? null : state.teamId ? { kind: "team", organizationId: org.id, teamId: state.teamId } : { kind: "organization", organizationId: org.id };
  const navigator = <DirectoryNavigator organizations={organizations} state={state} choose={navigateScope} context={roster?.context} pending={loaded.kind === "loading"} />;
  return <DirectoryFrame navigator={navigator} state={state}>
    {(!roster || !teamValid) && <div className="directory-scope-title"><h2>{teamValid && team ? team.name : org.name}</h2>{org.schemaVersion !== 2 && <span className="admin-chip">Legacy</span>}</div>}
    {loaded.kind === "loading" && <p role="status">{roster ? "Updating organization and teams…" : "Loading organization and teams…"}</p>}
    {loaded.kind === "error" && <LoadError message={loaded.message} retry={refresh} />}
    {roster && !teamValid && <section className="directory-invalid-team" role="alert"><h2>Team unavailable</h2><p>This team is no longer available in {org.name}. No team reporting or people are shown.</p><button type="button" className="quiet-button" onClick={() => navigateScope({ teamId: undefined, directoryLevel: "teams" })}>Back to organization</button></section>}
    {roster && teamValid && <>{roster.notices.map(message => <p className="admin-note" role="status" key={message}>{message}</p>)}<PlayerReporting state={state} choose={choose} scope={scope} accountRows={people ? rows : undefined} roster={roster} accountCount={selectedRows.length} enabled directoryReady={directoryReady} legacy={org.schemaVersion !== 2} scopeLabel={identityScope?.label || org.name} showPeople={people}
    afterGraphs={!people ? metrics => <TeamDirectory organization={org} context={roster.context} players={roster.players} choose={navigateScope} metrics={metrics} state={state} /> : undefined}
    scopeControl={<><button type="button" className="directory-text-button" onClick={() => navigateScope({ orgId: undefined, teamId: undefined, directoryLevel: "organizations" })}>Organizations</button><span aria-hidden="true">/</span>{people ? <button type="button" className="directory-text-button" onClick={() => navigateScope({ teamId: undefined, directoryLevel: "teams" })}>{org.name}</button> : <span aria-current="page">{org.name}</span>}{team && <><span aria-hidden="true">/</span><span aria-current="page">{team.name}</span></>}</>}
    toolbar={<div className="directory-toolbar"><label className="directory-search"><span>Find a player in this organization</span><input type="search" value={state.search} placeholder="Name or email" onChange={event => choose({ search: event.target.value, page: 1, reportMode: "directory" }, true)} /></label>
      <button className="quiet-button" aria-label="Refresh players" onClick={refresh}>Refresh roster</button>
    </div>}
    beforeRoster={unassigned && <p className="admin-note">The account roster shows unassigned or unavailable teams. Graphs use the unassigned reporting filter; each available account row retains its own recorded activity.</p>}
    afterRoster={org.schemaVersion === 2 && <DirectoryPlayerActions org={org} context={roster.context} currentTeamId={state.teamId} onChanged={refresh} />}
  /></>}</DirectoryFrame>;
}

/** Identity counts follow current context teams, including visible reporting-excluded accounts. */
export function organizationPeopleScope(org: OrganizationRow, roster: DirectoryRoster, state: AdminDirectoryState) {
  const teams = roster.context?.teams.filter(team => team.organizationId === org.id) || [];
  const team = teams.find(team => team.id === state.teamId), valid = !state.teamId || Boolean(team);
  const unassigned = !state.teamId && state.directoryLookup === "unassigned";
  const players = !valid ? [] : unassigned && roster.context ? roster.players.filter(player => !teams.some(team => team.id === player.teamId)) : directoryPlayers(roster.players, "", state.teamId);
  return { team, valid, unassigned, players, label: team?.name || (unassigned ? `Unassigned / unavailable team · ${org.name}` : org.name) };
}

export function DirectoryPlayersTable({ players, roster, state, choose, metrics, metricRows, serverPage = false }: { players: PlayerRow[]; roster?: DirectoryRoster; state: AdminDirectoryState; choose(patch: Partial<AdminDirectoryState>): void; metrics?: WorkspaceMetricState; metricRows?: WorkspacePlayerMetric[]; serverPage?: boolean }) {
  const page = directoryPage(players, state.page);
  const byId = new Map(metricRows?.map(row => [row.playerId, row]));
  return <>
    {players.length ? <table className={`directory-player-table${metrics ? " with-metrics" : ""}`}><thead><tr><th scope="col">Player</th><th scope="col">Team</th><th scope="col">Age</th>{metrics && <><th scope="col">Testing</th><th scope="col">Completed workouts</th><th scope="col">Estimated active use</th></>}<th scope="col">Open</th></tr></thead><tbody>{(serverPage ? players.slice(0, 20) : page.rows).map(player => {
      const age = resolvePlayerAge(player.raw), team = roster?.context?.teams.find(entry => entry.id === player.teamId);
      return <tr key={player.id}>
        <td data-label="Player"><Link id={`admin-player-${player.id}`} className="directory-player-name" to={adminPlayerPath(player.id, "results", state)}><strong>{player.name}</strong></Link>
          <span className="directory-player-email">{player.email || "No email on file"}</span>{player.registered ? <span className="directory-account-status">Account claimed</span> : <SignupStatus playerId={player.id} playerName={player.name} reloadKey={player} />}
        </td>
        <td data-label="Team">{team?.name || (player.teamId ? roster?.context ? "Team unavailable" : "Assigned team" : "Unassigned")}</td><td data-label="Age">{age.age === null ? "Not recorded" : `${age.age} years`}</td>
        {metrics && <WorkspaceMetricCells {...metrics} legacy={metrics.legacy || !hasClubIdentity(player)} metric={byId.get(player.id)} />}
        <td data-label="Open"><details className="directory-row-menu" name="directory-row-actions" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label={`Open actions for ${player.name}`}>Open<span aria-hidden="true">⌄</span></summary><div className="directory-row-actions"><Link id={`admin-player-${player.id}-workouts`} className="quiet-button small" to={adminPlayerPath(player.id, "workouts", state)} aria-label={`Workouts for ${player.name}`}>Workouts</Link><Link id={`admin-player-${player.id}-profile`} className="quiet-button small" to={adminPlayerPath(player.id, "profile", state)} aria-label={`Profile for ${player.name}`}>Profile</Link></div></details></td>
      </tr>;
    })}</tbody></table> : <p className="admin-empty">{state.search ? "No players match this search." : "No players in this selection yet."}</p>}
    {!serverPage && page.totalPages > 1 && <nav className="directory-pagination" aria-label="Player pages"><button className="quiet-button" disabled={page.page === 1} onClick={() => choose({ page: page.page - 1 })}>Previous</button><span>Page {page.page} of {page.totalPages}</span><button className="quiet-button" disabled={page.page === page.totalPages} onClick={() => choose({ page: page.page + 1 })}>Next</button></nav>}
  </>;
}

function PlayerLookup({ source, state, choose, navigateScope, canonicalOrganizationIds }: { source: DirectorySource; state: AdminDirectoryState; choose: ChooseDirectory; navigateScope: ChooseDirectory; canonicalOrganizationIds: string[] }) {
  const people = directoryLevelOf(state) === "people";
  const unassigned = state.directoryLookup === "unassigned";
  const used = people && (state.search.trim().length >= 2 || unassigned);
  const loader = useCallback(async () => {
    if (!used) return null;
    const index = await source.lookup();
    if (!unassigned) return { ...index, organizations: [] as OrganizationRow[], coaches: [] as CoachRow[], teams: [] as Awaited<ReturnType<DirectorySource["teams"]>> };
    const [organizations, coaches, teams] = await Promise.all([source.organizations(), source.coaches(), source.teams()]);
    return { ...index, organizations, coaches, teams };
  }, [source, unassigned, used]);
  const { state: loaded, refresh } = useAccountLoad(loader);
  const index = used && loaded.kind === "ready" ? loaded.data : null;
  const rows = index ? unassigned ? unassignedDirectoryPlayers(index.players, index.organizations, index.coaches, index.teams) : directoryPlayers(index.players, state.search) : [];
  return <PlayerReporting state={state} choose={choose} scope={{ kind: "global" }} canonicalOrganizationIds={canonicalOrganizationIds} accountRows={used ? rows.slice(0, 40) : undefined} enabled scopeLabel="All current organizations" showPeople={people}
    afterGraphs={!people && <section className="directory-team-directory"><h3>Organizations</h3><p className="admin-note">Choose an organization in Browse to view its graphs and teams. Independent coaches are available in Staff.</p><button type="button" className="quiet-button" onClick={() => navigateScope({ orgId: undefined, teamId: undefined, directoryLevel: "people" })}>Find a player</button></section>}
    toolbar={<><h3 className="workspace-roster-heading">Find a player</h3><p className="admin-note">Browse an organization for its full roster, or use the bounded name/email lookup below.</p>
      <label className="directory-search"><span>Player lookup</span><input type="search" value={state.search} placeholder="Enter at least two characters" onChange={event => choose({ directoryLookup: undefined, search: event.target.value, page: 1, reportMode: "directory" }, true)} /></label>
      <button className="quiet-button directory-unassigned" aria-pressed={unassigned} onClick={() => choose({ directoryLookup: unassigned ? undefined : "unassigned", search: "", page: 1, reportMode: "directory" })}>Unassigned players in bounded lookup</button>
    </>}
    beforeRoster={<>{used && loaded.kind === "loading" && <p role="status">Loading player lookup…</p>}{used && loaded.kind === "error" && <LoadError message={loaded.message} retry={refresh} />}
      {index && <p className="admin-note" role="status">Global lookup covers the first {PLAYER_INDEX_LIMIT} player profiles and displays up to 40 matches. Organization browsing remains available beyond this index.{index.truncated && " More profiles exist outside this lookup."}</p>}
      {rows.length > 40 && <p className="admin-note">Showing the first 40 matches. Refine the name or email to narrow this lookup.</p>}
    </>}
  />;
}

/** One reporting reader and one roster per scope; history never substitutes for current account ownership. */
export function PlayerReporting({ state, choose, scope, canonicalOrganizationIds, accountRows, roster, accountCount, enabled, directoryReady = true, legacy = false, scopeLabel, scopeControl, toolbar, beforeRoster, afterRoster, afterGraphs, showPeople }: {
  state: AdminDirectoryState; choose: ChooseDirectory; scope: InsightScope | null; canonicalOrganizationIds?: string[]; accountRows?: PlayerRow[]; roster?: DirectoryRoster; accountCount?: number; enabled: boolean; directoryReady?: boolean; legacy?: boolean; scopeLabel: string; scopeControl?: ReactNode; toolbar: ReactNode; beforeRoster?: ReactNode; afterRoster?: ReactNode; afterGraphs?: ReactNode | ((metrics: WorkspaceMetricState) => ReactNode); showPeople: boolean;
}) {
  const attention = state.reportMode === "attention", request = workspaceReportRequest(state);
  const view = state.reportView || "overview", requestedPane = directoryWorkspacePaneOf(state);
  const onePagerOrganization = scope?.kind === "organization" && supportsOnePagerTracking(state) ? scope.organizationId : undefined;
  const showOnePagers = Boolean(onePagerOrganization);
  const pane = !showOnePagers && requestedPane === "one-pagers" ? "list" : requestedPane;
  const onePagers = pane === "one-pagers";
  const activityView = pane === "report" && view !== "testing";
  const visible = directoryPage(accountRows || [], state.page).rows;
  const playerIds = pane === "report" || !showPeople || attention ? undefined : supportedWorkspacePlayerIds(visible, scope, canonicalOrganizationIds);
  const metrics = useWorkspaceMetrics({ retain: true, scope, search: workspaceReportSearch(state), playerIds, enabled, readEnabled: directoryReady && !onePagers,
    adminReporting: !legacy && (pane === "report" || !showPeople && Boolean(state.orgId)),
    includeLastFeatureEvidence: !legacy && pane === "report" && view === "usage",
    includeTestingAnalytics: !legacy && pane === "report" && view === "testing" });
  const report = metrics.data;
  const displayReport = report || metrics.summaryData;
  const detailsPending = !report && !metrics.error;
  const focusReview = useRef(false);
  const focusActivity = useRef(false);
  const update = (patch: Partial<ExpandedRequest>) => {
    const next = withWorkspaceReport(state, { ...patch, cursor: "", page: 0 });
    const filterChanged = ["division", "ageBand", "testingStatus", "workoutStatus", "usageStatus", "usagePlatform", "usageFeature", "teamAssignment", "rosterSearch"].some(key => key in patch);
    if (filterChanged) {
      next.reportMode = pane === "report" ? "directory" : hasPlayerFilters(workspaceReportRequest(next)) || Boolean(next.reportSearch) ? "attention" : "directory";
      next.directoryPane = pane;
    }
    if ("adminFollowUp" in patch || "adminSort" in patch) { next.reportMode = "directory"; next.directoryPane = "report"; }
    if (filterChanged && patch.view) focusReview.current = true;
    choose(next);
  };
  const queueKey = !onePagers && showPeople && attention && scope?.kind === "global" && report ? JSON.stringify(report.players.slice(0, 20).map(player => ({ id: player.id, organizationId: player.organizationId, teamId: player.teamId }))) : "[]";
  const queueLoader = useCallback(async () => {
    const expected = JSON.parse(queueKey) as Pick<ExpandedPlayer, "id" | "organizationId" | "teamId">[];
    const profiles = await Promise.all(expected.map(player => loadPlayer(player.id)));
    return profiles.filter((player, index): player is PlayerRow => Boolean(player && hasClubIdentity(player) && (player.organizationId || "") === (expected[index].organizationId || "") && (player.teamId || null) === (expected[index].teamId || null)));
  }, [queueKey]);
  const { state: queueProfiles, refresh: refreshQueue } = useAccountLoad(queueLoader);
  const availableQueueProfiles = scope?.kind === "global" ? queueProfiles.kind === "ready" ? queueProfiles.data : [] : roster?.players || [];
  const queueById = new Map(availableQueueProfiles.map(player => [player.id, player]));
  const queue = report?.players.slice(0, 20).flatMap(expected => {
    const profile = queueById.get(expected.id);
    return profile && hasClubIdentity(profile) && (profile.organizationId || "") === (expected.organizationId || "") && (profile.teamId || null) === (expected.teamId || null) ? [profile] : [];
  }) || [];
  const metricRows: WorkspacePlayerMetric[] = attention ? report?.players.map(player => ({ playerId: player.id, status: "included", player })) || [] : report?.rosterMetrics || [];
  const metricState = { ...metrics, legacy };
  const activeView = onePagers ? "one-pagers" : pane === "report" ? view : "list";
  const firstPage = () => choose({ reportCursor: undefined, reportPage: undefined });
  const nextPage = () => { if (report?.pagination.nextCursor) choose({ reportCursor: report.pagination.nextCursor, reportPage: request.page + 1 }); };
  useEffect(() => {
    if (attention && focusReview.current) { focusReview.current = false; document.getElementById("workspace-review-heading")?.focus({ preventScroll: true }); }
  }, [attention, view, pane]);
  useEffect(() => {
    if (!activityView) focusActivity.current = false;
    // A new server selection unmounts the old table while loading. Focus only
    // after the matching report is visible, never the soon-to-be-removed table.
    if (focusActivity.current && report && !metrics.loading && !metrics.refreshing) {
      focusActivity.current = false;
      document.getElementById("activity-people-title")?.focus();
    }
  }, [activityView, report, metrics.loading, metrics.refreshing, request]);
  const filters = <DirectoryFilters summary="Changes apply to this reporting scope. Name/email lookup remains separate from reporting filters.">
        <WorkspaceReportControls request={request} disabled={legacy} onChange={update} />
        {!legacy && <DirectoryPlayerFilters request={request} onChange={update} />}
        {displayReport && <div className="pt-insights"><PlayerFilters data={displayReport} request={request} onChange={update} /></div>}
      </DirectoryFilters>;
  return <>
    <WorkspaceScopeHeader {...metricState} data={displayReport} accountCount={accountCount} accountScopeIsSubset={state.directoryLookup === "unassigned"} scopeLabel={scopeLabel} request={request} breadcrumb={scopeControl}>
      <DirectoryWorkspaceTabs active={activeView} onePagers={showOnePagers} listLabel={showPeople ? "People" : state.orgId ? "Teams" : "Organizations"} onChange={selected => choose({ reportCursor: undefined, reportPage: undefined, reportAdminSort: undefined, reportAdminFollowUp: undefined,
        ...(selected === "list" || selected === "one-pagers" ? { directoryPane: selected } : { directoryPane: "report" as const, reportView: selected, reportMode: "directory" as const }) })} />
    </WorkspaceScopeHeader>
    {onePagers && onePagerOrganization ? <OnePagerTracking organizationId={onePagerOrganization} cohortId={state.onePagerCohort} onCohortChange={onePagerCohort => choose({ onePagerCohort })} /> : <>
    <div className="directory-view-toolbar"><div className="directory-list-search">{pane === "list" && showPeople && !attention ? toolbar : null}</div>
      {filters}
      {pane === "report" && !legacy && <button type="button" className="quiet-button" disabled={metrics.loading || metrics.refreshing} onClick={() => { metrics.refresh(); refreshQueue(); }}>Refresh reporting</button>}
    </div>
    {displayReport && hasPlayerFilters(request) && <div className="pt-insights directory-active-filters"><PlayerFilters data={displayReport} request={request} onChange={update} /></div>}
    {pane === "report" && displayReport && <p className="admin-note">Report checked {new Date(displayReport.generatedAtMillis).toLocaleString('en-US', { timeZone: request.timezone, dateStyle: 'medium', timeStyle: 'short' })} · {request.timezone}.</p>}
    {metrics.refreshing && displayReport && <p role="status" className="admin-note">Updating activity… Showing the last successful report.</p>}
    {(metrics.stale || !report && metrics.summaryStale && metrics.error) && <p role="alert" className="form-message">Refresh failed. These figures are from the last successful report. Refresh reporting to retry.</p>}
    {pane === "report" && (!activityView || !report?.adminReporting) && <details className="workspace-report-method"><summary>How this is measured</summary><p className="admin-note">Name search and pages change the displayed people, not the complete organization/team totals or rankings. Follow-up lists are separate from reporting cohort filters.</p>
    <p className="admin-note">Testing coverage is {request.testingWindow === "cumulative" ? "cumulative through the selected end date" : "limited to the selected period"}. Workouts and estimated use cover {request.startDate} through {request.endDate}, in {request.timezone.replaceAll("_", " ")}. Reporting follows current membership; excluded history and uncollected use remain distinct from zero.</p></details>}
    {legacy && <p className="admin-note" role="status">Activity reporting is unavailable for this legacy organization. Its accounts and signup controls remain available below.</p>}
      {metrics.loading && !displayReport && <p role="status">{metrics.rebuilding ? "Preparing the latest complete activity report…" : "Loading activity reporting…"}</p>}
      {metrics.error && <LoadError message={metrics.error} retry={() => { metrics.refresh(); refreshQueue(); }} />}
    {pane === "report" && <section id={`workspace-report-panel-${view}`} role="tabpanel" aria-labelledby={`workspace-report-tab-${view}`}>
      {displayReport && activityView && <AdminActivityReport data={displayReport} detailsPending={detailsPending} request={request} view={view as "overview" | "workouts" | "usage"} busy={metrics.refreshing}
        onChange={update} onExplore={patch => { focusActivity.current = true; update(patch); }} onFirstPage={firstPage} onNextPage={nextPage}
        playerLink={(id, panel) => adminPlayerPath(id, panel, state)}
        teamLink={(orgId, teamId) => adminDirectoryPath(selectDirectoryScope(state, { orgId, teamId: teamId || undefined, directoryLevel: "people", directoryLookup: teamId ? undefined : "unassigned" }))}>
        <div id="directory-report-graphs" tabIndex={-1} role="region" aria-label="Report graphs"><WorkspaceReportDetails data={displayReport} request={request} onChange={update} hideSummary detailsPending={detailsPending} /></div>
      </AdminActivityReport>}
      {displayReport && view === "overview" && <WorkspaceAttention data={displayReport} onChange={update} />}
      {(!activityView || !displayReport) && <div id="directory-report-graphs" tabIndex={-1} role="region" aria-label="Report graphs">
        {displayReport && <WorkspaceReportDetails data={displayReport} detailsPending={detailsPending} request={request} onChange={update} showPlayers={false}
          hideSummary={activityView && Boolean(displayReport.adminReporting)} onFirstPage={firstPage} onNextPage={nextPage} playerLink={player => adminPlayerPath(player.id, "results", state)} />}
      </div>}
    </section>}
    {pane === "list" && directoryReady && <section id="workspace-report-panel-list" role="tabpanel" aria-labelledby="workspace-report-tab-list">
      {typeof afterGraphs === "function" ? afterGraphs(metricState) : afterGraphs}
      {showPeople && <>
      {attention && <><h3 id="workspace-review-heading" tabIndex={-1} className="workspace-roster-heading">{view[0].toUpperCase() + view.slice(1)} player review</h3><div className="workspace-queue-toolbar"><label className="directory-search"><span>Find in reporting queue · names only</span><input type="search" value={state.reportSearch || ""} placeholder="Player name" onChange={event => update({ rosterSearch: event.target.value })} /></label><button className="quiet-button" onClick={() => choose({ ...withWorkspaceReport(state, { ...clearPlayerFilters(), rosterSearch: "", cursor: "", page: 0 }), reportMode: "directory", directoryPane: "list" })}>Back to account roster</button></div>{report && <p className="directory-result-count">{report.pagination.total} matching {report.pagination.total === 1 ? "player" : "players"} in this reporting queue{request.rosterSearch ? " · name search applied" : ""}</p>}</>}
      {beforeRoster}
      <div id="workspace-roster" tabIndex={-1} role="region" aria-label="Player roster">
        {!attention && accountRows !== undefined && <><p className="directory-result-count">{accountRows.length} {accountRows.length === 1 ? "player" : "players"}{state.search && " matching your name or email search"}</p><DirectoryPlayersTable players={accountRows} roster={roster} state={state} choose={choose} metrics={metricState} metricRows={metricRows} /></>}
        {attention && report && <>
          {scope?.kind === "global" && queueProfiles.kind === "loading" && <p role="status">Checking current player accounts…</p>}
          {scope?.kind === "global" && queueProfiles.kind === "error" && <LoadError message={queueProfiles.message} retry={refreshQueue} />}
          {(scope?.kind !== "global" || queueProfiles.kind === "ready") && <>{queue.length !== report.players.length && <p className="admin-note" role="status">Some accounts in this report are no longer available in the current roster. Refresh the roster and report to check membership.</p>}
            <DirectoryPlayersTable players={queue} roster={roster} state={state} choose={choose} metrics={metricState} metricRows={metricRows} serverPage />
            <nav className="directory-pagination" aria-label="Reporting player pages"><button className="quiet-button" disabled={!request.page} onClick={() => choose({ reportCursor: undefined, reportPage: undefined })}>First page</button><span>{report.pagination.total} matching players · page {request.page + 1}</span><button className="quiet-button" disabled={!report.pagination.nextCursor} onClick={() => choose({ reportCursor: report.pagination.nextCursor || undefined, reportPage: request.page + 1 })}>Next</button></nav>
          </>}
        </>}
      </div>
      {!attention && afterRoster}
      </>}
    </section>}
    </>}
    {["list", "overview", "testing", "workouts", "usage", ...(showOnePagers ? ["one-pagers"] : [])].filter(id => id !== activeView).map(id => <section key={id} id={`workspace-report-panel-${id}`} role="tabpanel" aria-labelledby={`workspace-report-tab-${id}`} hidden />)}
  </>;
}

/** Canonical membership is required even when a legacy profile owns an organizationId field. */
export function supportedWorkspacePlayerIds(players: PlayerRow[], scope: InsightScope | null, canonicalOrganizationIds: string[] = []) {
  return players.slice(0, 20).filter(player => hasClubIdentity(player) && Boolean(player.organizationId)
    && (scope?.kind === "global" ? canonicalOrganizationIds.includes(player.organizationId!) : (scope?.kind === "organization" || scope?.kind === "team") && player.organizationId === scope.organizationId))
    .map(player => player.id);
}
function LegacyStaff({ organization, source, state }: { organization: OrganizationRow; source: DirectorySource; state: AdminDirectoryState }) {
  const { state: loaded, refresh } = useAccountLoad(source.coaches);
  if (loaded.kind === "loading") return <p role="status">Loading legacy coaches…</p>;
  if (loaded.kind === "error") return <LoadError message={loaded.message} retry={refresh} />;
  const groups = legacyCoachGroups([organization], loaded.data);
  return <><p className="admin-note">This legacy organization retains its existing coach relationships. Canonical team and staff controls apply to current club organizations.</p><CoachList coaches={groups.groups.get(organization.id) || []} state={state} /></>;
}
function IndependentStaff({ source, organizations, state }: { source: DirectorySource; organizations: OrganizationRow[]; state: AdminDirectoryState }) {
  const { state: loaded, refresh } = useAccountLoad(source.coaches);
  if (loaded.kind === "loading") return <p role="status">Loading independent coaches…</p>;
  if (loaded.kind === "error") return <LoadError message={loaded.message} retry={refresh} />;
  const groups = legacyCoachGroups(organizations, loaded.data);
  return <><h2>Independent coaches</h2><CoachList coaches={groups.independent} state={state} />
    {groups.unknown.length > 0 && <><h3>Accounts with an unavailable organization</h3><p className="admin-note">Their accounts remain available for review; their old roster does not grant current organization access.</p><CoachList coaches={groups.unknown} state={state} /></>}
    <Link className="quiet-button" to="/admin/access">PoseTek admin access & recovery</Link>
  </>;
}
function CoachList({ coaches, state }: { coaches: CoachRow[]; state: AdminDirectoryState }) {
  if (!coaches.length) return <p className="admin-empty">No coaches in this selection.</p>;
  return <div className="admin-rows">{coaches.map(coach => <Link key={coach.id} className="admin-row" to={directoryCoachPath(coach.id, state)}>
    <AccountAvatar name={coach.name} /><span className="admin-row-copy"><strong>{coach.name}</strong><span className="admin-row-meta">{coach.email || "No email on file"} · Legacy roster</span></span><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Link>)}</div>;
}

/** Retained for older embedded team roster consumers. Directory browsing no longer requires it. */
export function TeamRoster({ row, selected, choose }: { row: HierarchyTeam; selected: AccountContext; choose: (context: AccountContext) => void }) {
  const open = selected.teamId === row.team.id, context = { ...selected, orgId: row.team.organizationId, teamId: row.team.id };
  return <div className={`admin-team${open ? " open" : ""}`}><button type="button" className="admin-row admin-team-toggle" aria-expanded={open} onClick={() => choose({ ...context, teamId: open ? undefined : row.team.id })}><span className="material-symbols-outlined" aria-hidden="true">{open ? "expand_more" : "chevron_right"}</span><span className="admin-row-copy"><strong>{row.team.name}</strong><span className="admin-row-meta">{row.players.length} {row.players.length === 1 ? "athlete" : "athletes"} · {row.coaches.map(staffName).join(", ") || "No linked coach account"}</span></span></button>
    {open && <div className="admin-team-players"><Link className="quiet-button" to={insightsLink(context, "accounts")}>Team Insights</Link>{!row.players.length && <p className="admin-empty">No athletes on this team yet.</p>}{row.players.map(player => <PlayerRosterRow key={player.id} player={player} compact context={context} />)}</div>}</div>;
}
export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div><p className="form-message" role="alert">{message}</p><button className="quiet-button" onClick={retry}>Try again</button></div>;
}
