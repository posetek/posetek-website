import { useSearchParams, Link } from "react-router-dom";
import { auth } from "../../../lib/firebase";
import { getClubContext } from "../../../lib/organization-data";
import { AdminDisclosure, GuardianConsent, ReplyInbox } from "../../coach-reminders/ReminderAdmin";
import { vacavilleId } from "../../coach-reminders/reminders";
import { useAccountLoad } from "../lib/useAccountLoad";
import { TextingPlan } from "./TextingPlan";
import "./admin-messaging.css";

const sections = { inbox: "Inbox", forwarded: "Forwarded replies", plan: "Texting plan" } as const;
type Section = keyof typeof sections;

const loadVacaville = () => getClubContext(vacavilleId);

function ClubMessages({ section }: { section: Exclude<Section, "plan"> }) {
  const { state, refresh } = useAccountLoad(loadVacaville);
  if (state.kind === "loading") return <p role="status">Opening the Vacaville inbox…</p>;
  if (state.kind === "error")
    return (
      <div role="alert">
        <p>{state.message}</p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  const context = state.data;
  if (context.organization?.id !== vacavilleId || !["admin", "manager"].includes(context.role)) {
    return <p>You need Vacaville messaging access to view parent replies.</p>;
  }
  return (
    <div className="coach-reminders" key={auth.currentUser?.uid}>
      <ReplyInbox key={section} context={context} forwardedOnly={section === "forwarded"} />
      {section === "inbox" && (
        <AdminDisclosure title="Guardian SMS permissions">
          <GuardianConsent context={context} />
        </AdminDisclosure>
      )}
    </div>
  );
}

export default function AdminMessaging({ preview = false }: { preview?: boolean }) {
  const [params] = useSearchParams();
  const orgId = params.get("orgId");
  const selected = params.get("section");
  const section: Section = selected === "forwarded" || selected === "plan" ? selected : "inbox";
  function sectionLink(next: Section) {
    const query = new URLSearchParams(params);
    query.set("orgId", vacavilleId);
    if (next === "inbox") query.delete("section");
    else query.set("section", next);
    return { pathname: "/admin/messaging", search: query.toString() };
  }
  if (orgId && orgId !== vacavilleId) {
    return (
      <section className="admin-messaging">
        <h1>Messaging</h1>
        <p>Parent messaging is available for Vacaville United Soccer Club.</p>
        <Link to={sectionLink("inbox")}>Open Vacaville messaging</Link>
      </section>
    );
  }
  return (
    <section className="admin-messaging" aria-labelledby="messaging-title">
      <header className="admin-overview-heading">
        <div>
          <h1 id="messaging-title">Messaging</h1>
          <p>Vacaville United Soccer Club</p>
        </div>
      </header>
      <nav aria-label="Messaging sections">
        {(Object.keys(sections) as Section[]).map((key) => (
          <Link key={key} to={sectionLink(key)} aria-current={section === key ? "page" : undefined}>
            {sections[key]}
          </Link>
        ))}
      </nav>
      {section === "plan" ? (
        <TextingPlan />
      ) : (
        <section className="messaging-panel" aria-labelledby="messaging-panel-title">
          <h2 id="messaging-panel-title">{section === "inbox" ? "Parent inbox" : sections[section]}</h2>
          <p>
            {section === "inbox"
              ? "Parent replies arrive here first. Choose a team and coach to forward a reply."
              : "Review the replies Vacaville Admin has forwarded to coaches."}
          </p>
          {preview ? (
            <p className="messaging-preview">
              Local preview · Parent conversations are available after admin sign-in.
            </p>
          ) : (
            <ClubMessages section={section} />
          )}
        </section>
      )}
    </section>
  );
}
