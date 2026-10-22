import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import Icon from "./AdminWorkspaceIcon";
import { useAdminToolLinks } from "../lib/useAdminNavigation";
import { ADMIN_WORKSPACE_GROUPS, adminWorkspaceContext, findAdminTools } from "../lib/adminWorkspace";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]';

export default function AdminHeader({ ready, email, uid = "", preview = false, onSignOut }: {
  ready: boolean; email?: string; uid?: string; preview?: boolean; onSignOut: () => void;
}) {
  const location = useLocation(), toolPath = useAdminToolLinks(uid);
  const route = location.pathname + location.search;
  const [drawerRoute, setDrawerRoute] = useState<string | null>(null);
  const drawer = drawerRoute === route;
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1050px)").matches);
  const rail = useRef<HTMLElement>(null), opener = useRef<HTMLButtonElement>(null), account = useRef<HTMLDetailsElement>(null);
  const restoreFocus = useRef(true);
  const currentRoute = useRef(route);
  useLayoutEffect(() => { currentRoute.current = route; }, [route]);
  const context = adminWorkspaceContext(location.pathname);
  const overviewPath = `/insights?from=organization&view=overview${preview ? "&preview=1" : ""}`;
  const dismiss = (restore = true) => { restoreFocus.current = restore; setDrawerRoute(null); };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1050px)");
    const update = () => { setMobile(media.matches); if (!media.matches) setDrawerRoute(null); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (account.current) account.current.open = false;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (account.current?.open && event.target instanceof Node && !account.current.contains(event.target)) account.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    if (!mobile || !drawer || !rail.current) return;
    const panel = rail.current;
    const openButton = opener.current, openedForRoute = currentRoute.current;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".admin-workspace__toolbar, .admin-workspace__content, .admin-workspace__skip"));
    const previous = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(element => element.getClientRects().length);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); restoreFocus.current = true; setDrawerRoute(null); }
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const contain = (event: FocusEvent) => { if (event.target instanceof Node && !panel.contains(event.target)) focusable()[0]?.focus(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("keydown", onKey); document.removeEventListener("focusin", contain);
      background.forEach((element, index) => { element.inert = previous[index]; });
      document.body.style.overflow = overflow;
      if (restoreFocus.current && currentRoute.current === openedForRoute && openButton?.getClientRects().length) openButton.focus();
      else if (currentRoute.current !== openedForRoute || !restoreFocus.current) document.getElementById("admin-main")?.focus({ preventScroll: true });
    };
  }, [drawer, mobile]);

  return <>
    <header className="admin-workspace__toolbar">
      {ready && <button ref={opener} className="admin-workspace__menu" type="button" aria-label="Open admin navigation" aria-expanded={drawer} aria-controls="admin-navigation" onClick={() => { restoreFocus.current = true; setDrawerRoute(route); }}><Icon name="menu" /></button>}
      <Link className="admin-workspace__brand" to={toolPath("/admin/accounts")} aria-label="PoseTek people and organizations"><img className="admin-workspace__mark" src="/brand/posetek-p.svg" alt="" width="36" height="36" /><span>POSETEK</span><span className="admin-workspace__badge">Admin</span></Link>
      {ready && <><ToolSearch key={route} toolPath={toolPath} /><details ref={account} className="admin-workspace__account" onKeyDown={event => {
        if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }}>
        <summary aria-label="Admin account menu" title={email}><span className="admin-workspace__avatar">{(email || "A")[0].toUpperCase()}</span><Icon name="expand_more" /></summary>
        <div className="admin-workspace__account-panel"><span className="admin-workspace__account-label">Signed in as</span><strong>{email || "PoseTek administrator"}</strong><Link to={toolPath("/admin/access")}><Icon name="key" />Account access</Link><Link to="/feed"><Icon name="dynamic_feed" />Community feed</Link><button type="button" onClick={onSignOut}><Icon name="logout" />Sign out</button></div>
      </details></>}
    </header>
    {ready && <>
      {mobile && drawer && <div className="admin-workspace__backdrop" aria-hidden="true" onClick={() => dismiss()} />}
      <aside ref={rail} id="admin-navigation" className={`admin-workspace__rail${drawer ? " is-open" : ""}`} inert={mobile && !drawer} role={mobile && drawer ? "dialog" : undefined} aria-modal={mobile && drawer ? true : undefined} aria-label="Admin navigation">
        <div className="admin-workspace__rail-intro"><div><span>POSETEK WORKSPACE</span><strong>Administration</strong></div><button type="button" className="admin-workspace__drawer-close" aria-label="Close admin navigation" onClick={() => dismiss()}><Icon name="close" /></button></div>
        <nav aria-label="Admin sections">
          <NavLink to={overviewPath} onClick={() => dismiss(false)} className={({ isActive }) => `admin-workspace__overview${isActive ? " active" : ""}`}>Overview</NavLink>
          {ADMIN_WORKSPACE_GROUPS.map(group => <section className="admin-workspace__nav-group" key={group.label}><h2>{group.label}</h2>{group.tools.map(tool => <NavLink key={tool.path} to={toolPath(tool.path)} onClick={() => dismiss(false)} className={({ isActive }) => `admin-section-link${isActive ? " active" : ""}`}><Icon name={tool.icon} /><span>{tool.label}</span></NavLink>)}</section>)}
        </nav>
        <div className="admin-workspace__rail-footer"><span className="admin-workspace__status-dot" aria-hidden="true" /><span>PoseTek administration</span></div>
      </aside>
      <div className="admin-workspace__context" aria-label="Current workspace"><span><Icon name={context.icon} /><span>{context.section}</span><Icon name="chevron_right" /><strong>{context.title}</strong></span>{preview && <span className="admin-workspace__preview">Preview · sample data</span>}</div>
    </>}
  </>;
}


function ToolSearch({ toolPath }: { toolPath(path: string): string }) {
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [selected, setSelected] = useState(-1);
  const input = useRef<HTMLInputElement>(null), navigate = useNavigate();
  const tools = findAdminTools(query);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const editable = event.target instanceof Element && Boolean(event.target.closest('input, textarea, select, [contenteditable="true"]'));
      if (!editable && event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  return <div className="admin-workspace__search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <Icon name="search" /><input ref={input} type="search" aria-label="Find an admin tool" placeholder="Find an admin tool…" value={query} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? "admin-tool-results" : undefined} aria-activedescendant={open && selected >= 0 && tools[selected] ? `admin-tool-${selected}` : undefined} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setSelected(-1); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); setSelected(-1); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setSelected(value => tools.length ? value < 0 ? event.key === "ArrowDown" ? 0 : tools.length - 1 : (value + (event.key === "ArrowDown" ? 1 : -1) + tools.length) % tools.length : -1); }
      if (event.key === "Enter" && open && tools.length) { event.preventDefault(); navigate(toolPath(tools[Math.max(0, selected)].path)); setOpen(false); }
    }} /><kbd aria-hidden="true">/</kbd>
    {open && <div className="admin-workspace__search-panel"><p>Admin tools <span>Navigation only</span></p><ul id="admin-tool-results" role="listbox" aria-label="Matching admin tools">{tools.map((tool, index) => <li id={`admin-tool-${index}`} key={tool.path} role="option" aria-selected={selected === index} onMouseEnter={() => setSelected(index)}><Link to={toolPath(tool.path)} tabIndex={-1} onMouseDown={event => event.preventDefault()}><Icon name={tool.icon} /><span><strong>{tool.label}</strong><small>{tool.description}</small></span><Icon name="north_east" /></Link></li>)}</ul>{!tools.length && <div className="admin-workspace__search-empty">No matching tools. Try “players”, “workouts” or “access”.</div>}</div>}
  </div>;
}
