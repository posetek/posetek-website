// PoseTek privacy policy (September 2026 rewrite of the ported legacy privacy.html).
// Public, no-login page: App Store Connect's Privacy Policy URL points here.
// The first-party usage-measurement disclosures (Sections 3, 4, 6 and 8) are
// relied on by docs/insights/EXPANDED_INSIGHTS_HANDOFF.md; keep them in step
// with functions/insight-usage.js retention.
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useThemeColor } from "../../lib/use-theme-color";
import { injectClarity } from "./clarity";
import {
  POLICY_CONTACT_EMAIL,
  POLICY_EFFECTIVE_DATE,
  POLICY_LAST_UPDATED,
  POLICY_SECTIONS,
  sectionNumber,
  type PolicySectionId,
} from "./privacy-sections";
import "./privacy.scss";

function ContactEmail() {
  return <a href={`mailto:${POLICY_CONTACT_EMAIL}`}>{POLICY_CONTACT_EMAIL}</a>;
}

function PolicySection({ id, children }: { id: PolicySectionId; children: ReactNode }) {
  const title = POLICY_SECTIONS.find(section => section.id === id)?.title;
  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}><span className="section-num">{sectionNumber(id)}</span> {title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  useThemeColor(null); // legacy privacy.html had no theme-color meta
  useEffect(() => {
    document.title = "Privacy Policy | PoseTek";
    injectClarity();
    // Deep links (/privacy#childrens-privacy) land on their section; the route
    // is lazy, so the browser's own hash scroll runs before the section exists.
    const target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0); // full-page-load parity
  }, []);

  return (
    <div className="pt-privacy">
      <header>
        <Link to="/" className="logo">Pose<span>Tek</span></Link>
        <Link to="/" className="back-btn">← Home</Link>
      </header>

      <main>
        <div className="page-header">
          <div className="eyebrow">Legal</div>
          <h1>PoseTek Privacy Policy</h1>
          <p className="last-updated">
            <strong>Effective date:</strong> {POLICY_EFFECTIVE_DATE}<br />
            <strong>Last updated:</strong> {POLICY_LAST_UPDATED}
          </p>
        </div>

        <nav className="toc" aria-labelledby="privacy-toc-heading">
          <h2 id="privacy-toc-heading">Contents</h2>
          <ol>
            {POLICY_SECTIONS.map(section => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ol>
        </nav>

        <PolicySection id="who-we-are">
          <p>PoseTek ("PoseTek," "we," "us," or "our") is operated by PoseTek Inc., based in California, USA. We provide a soccer training platform that uses video and computer vision to analyze technique, measure performance, and build personalized training plans for players, with tools for coaches, parents, and clubs.</p>
          <p>This Privacy Policy explains what information we collect, how we use and share it, and the choices you have. It applies to the PoseTek mobile app, the PoseTek website at posetek.net, and related services (together, the "Services").</p>
          <p>If you have questions, contact us at <ContactEmail />.</p>
        </PolicySection>

        <PolicySection id="summary">
          <ul>
            <li>We collect the information needed to run a training platform: account details, player profile information, training videos, performance results, and basic app usage and diagnostic data.</li>
            <li>Training videos and performance data are linked to the player's account so we can show progress over time.</li>
            <li>Players' data may be visible to their own club's authorized coaches and administrators. Where a club has turned on the community feed, workout and drill activity can also be seen by teammates, according to the player's sharing settings. It is not public.</li>
            <li>AI coaching, workout generation and voice assistance send information to AI providers only after the athlete gives explicit permission in Account settings → AI sharing. Permission can be withdrawn at any time. Verified PoseTek staff administrators may also use AI features on an athlete's information for support and quality checks, with their own AI-sharing permission.</li>
            <li>The camera is used for drill recording, warm-up tracking and the hands-free Watch mode. Warm-up tracking and Watch mode analyze the camera image on the phone and do not save or upload video.</li>
            <li>We do not sell personal information. We do not show third-party ads. We do not track users across other companies' apps or websites.</li>
            <li>Many of our players are minors. We require a parent or guardian's consent for players under 13, and parents can review or delete their child's information at any time.</li>
            <li>You can request permanent deletion in the app under Profile → Account settings → Delete account. No support email is required.</li>
          </ul>
        </PolicySection>

        <PolicySection id="information-we-collect">
          <h3>Information you provide</h3>
          <ul>
            <li><strong>Account information:</strong> name, email address, password or sign-in credentials, and account role (player, parent, coach, or club administrator).</li>
            <li><strong>Player profile information:</strong> age or date of birth, playing position, team and club affiliation, experience level, training goals, and similar details used to personalize training.</li>
            <li><strong>Training videos and images:</strong> videos you record in the app or choose to upload from your photo library, such as footage of kicks, drills, and performance tests. These videos show the player and may incidentally show other people or surroundings in the frame.</li>
            <li><strong>Performance and training data:</strong> results from measured drills and performance tests, technique analysis results (including body-position and movement data derived from video), workouts assigned and completed, and progress over time.</li>
            <li><strong>Messages to the AI coach:</strong> the questions and requests you type or dictate when using AI features, voice transcripts used for supported voice-request routing, and the responses generated. The AI coach can also keep short notes ("memories") about your goals and preferences so later answers fit you better; you can review them, delete them one at a time or all at once, or turn memory off.</li>
            <li><strong>Voice mode:</strong> when you turn on voice mode in the iPhone app, it listens for drill commands and coaching questions and turns what you say into text. Speech recognition runs on your iPhone when the device supports it; Apple's speech service is used only if you allow it. Listening pauses while a rep is being recorded. Voice mode sends the text of what you say, not an audio recording, and text sent to AI providers is covered by the AI-sharing permission described in <a href="#ai-and-automated-processing">Section {sectionNumber("ai-and-automated-processing")}</a>.</li>
            <li><strong>Community activity:</strong> where your club has turned on the community feed, the comments and kudos you post, the athletes you connect with, and your sharing settings.</li>
            <li><strong>Coach and club input:</strong> feedback, comments, workout adjustments, and notes that coaches or administrators add to a player's profile.</li>
            <li><strong>Communications:</strong> information you send us when you contact support or submit an interest or booking form on our website.</li>
          </ul>

          <h3>Information collected automatically</h3>
          <ul>
            <li><strong>Identifiers:</strong> an account ID we assign to you, and app-installation or device-level identifiers generated by our service providers' software.</li>
            <li><strong>Usage data:</strong> how you interact with the Services, such as screens viewed, features used, and session times. For signed-in players this includes estimated active time and feature categories in the website and supported iPhone builds, associated with the player's account. Collection pauses when the app is in the background or the screen is idle. These usage reports do not contain page addresses, typed text, or screen recordings.</li>
            <li><strong>Diagnostics:</strong> crash logs and performance data, including device model and operating system version. Diagnostic media sharing is a separate, optional setting in the iPhone app and is off by default. When an eligible player enables it for their own profile, newly captured failed recordings and calibration images may be sent to PoseTek for troubleshooting. This choice applies to that account and athlete on that device, and is separate from saving successful training videos to the cloud. Coaches cannot grant it for another athlete. Turning it off prevents new diagnostic media uploads, including queued media; an upload already started may finish. Diagnostic logs still send when media sharing is off. Local recovery files may remain on the device even when sharing is off.</li>
          </ul>

          <h3>Device permissions</h3>
          <ul>
            <li>
              <strong>Camera:</strong> used only while one of these features is open in the app:
              <ul>
                <li><strong>Drill recording and calibration</strong>, to record performance tests and drills and to locate setup markers. Most drills analyze the recording on your iPhone and upload the results; the video itself is uploaded only when "Save video to cloud" is turned on in Drill Settings. Free recordings, and videos you choose to upload for analysis, are uploaded so they can be analyzed on our servers.</li>
                <li><strong>Warm-up tracking</strong>, which follows your position between the warm-up markers and sees when you raise a hand to begin.</li>
                <li><strong>Watch mode</strong>, the hands-free workout option that uses the front camera to see when you raise your hands to start or finish a set.</li>
              </ul>
              Warm-up tracking and Watch mode analyze body position on your iPhone as the camera runs. They do not save or upload video or images.
            </li>
            <li><strong>Microphone and speech recognition:</strong> used only for voice mode, as described above.</li>
            <li><strong>Photo library:</strong> used only when you choose to upload an existing video. We receive only the items you select.</li>
          </ul>
          <p>You can change these permissions at any time in your device settings.</p>

          <h3>Information we do not collect</h3>
          <p>We do not collect precise location, contacts, or advertising identifiers (IDFA), and we do not collect payment card details. The app does not offer in-app purchases. Where paid services are offered through our website, payments are processed by Stripe; we receive confirmation of payment and subscription status, not your card number or banking details.</p>
        </PolicySection>

        <PolicySection id="how-we-use-information">
          <p>We use the information we collect to:</p>
          <ul>
            <li>create and manage accounts and authenticate users;</li>
            <li>analyze training videos and generate technique feedback and performance measurements;</li>
            <li>build, adjust, and track personalized training plans and workouts;</li>
            <li>show players, parents, and authorized coaches a player's progress over time;</li>
            <li>show testing coverage, workout participation, and estimated active use to PoseTek administrators and the player's currently authorized club managers and coaches;</li>
            <li>provide AI coaching, workout generation and voice assistance, with the athlete's AI-sharing permission;</li>
            <li>show workout and drill activity to teammates in the community feed, where a club has turned it on;</li>
            <li>provide customer support and respond to requests;</li>
            <li>monitor, debug, secure, and improve the Services;</li>
            <li>develop and improve our analysis, benchmarks, and recommendations, using de-identified or aggregated data wherever practical; and</li>
            <li>comply with legal obligations and enforce our terms.</li>
          </ul>
          <p>We do not use personal information for third-party advertising or for tracking across other companies' apps and websites.</p>
        </PolicySection>

        <PolicySection id="ai-and-automated-processing">
          <p>PoseTek uses computer vision and artificial intelligence to analyze video, estimate body position and movement, score technique, and generate training recommendations and chat responses. Some of this processing happens on your device and some happens on our servers or those of our service providers.</p>
          <h3>AI features and your permission</h3>
          <ul>
            <li><strong>What the AI features are:</strong> the AI coach (questions about your results and training), workout and training-plan generation, analysis of recorded reps, and voice assistance in voice mode.</li>
            <li><strong>Permission first:</strong> the iPhone app asks for explicit permission before sending personal information through our AI gateway to an AI provider. In the app, open Account settings → AI sharing to allow, decline or withdraw permission. Until you allow it, the app's AI features stay off; recording remains available when AI sharing is off.</li>
            <li><strong>What is sent:</strong> depending on the feature, your messages, voice transcripts, athlete profile information, training history, performance measurements and reports.</li>
            <li>
              <strong>Who receives it:</strong>
              <ul>
                <li>Google Vertex AI (Gemini models), for coaching responses, analysis and training plans;</li>
                <li>Anthropic (Claude models), for coaching responses and checking training plans; and</li>
                <li>TypeSafe (Jev), for routing voice requests in voice mode.</li>
              </ul>
              We send only the information needed for each task, under agreements that prohibit those providers from using it to train their own models.
            </li>
            <li><strong>Withdrawing permission:</strong> you can withdraw at any time in Account settings → AI sharing. Withdrawal stops new AI requests; requests already sent may finish, and withdrawal does not delete existing conversations or reports (deleting your account does). If account-wide withdrawal cannot be confirmed because of a connection failure, the app keeps AI sharing off on that device and asks you to retry.</li>
            <li><strong>Separate from device permissions:</strong> AI permission is separate from microphone and speech-recognition permission. Permission is not transferred to another account or device.</li>
            <li><strong>Other people's data:</strong> a coach's, club administrator's or other staff member's permission does not authorize AI sharing of another player's information; for them, those AI features remain unavailable until athlete or guardian authority can be verified.</li>
            <li><strong>PoseTek administrators:</strong> verified PoseTek staff administrators may use AI features on an athlete's information to provide support and check quality, with their own AI-sharing permission. That information is sent to the same AI providers, under the same limits, as described above.</li>
          </ul>

          <h3>Limits of automated feedback</h3>
          <ul>
            <li>Content generated by AI, and other feedback and plans generated by the Services, is coaching guidance only. It is not medical advice and is not a substitute for a qualified coach's or medical professional's judgment.</li>
            <li>We may use de-identified and aggregated training and performance data to improve our own models and to build benchmarks (for example, comparing results against players of a similar age and position). This data is not used to identify any individual player.</li>
          </ul>
        </PolicySection>

        <PolicySection id="how-we-share-information">
          <p>We share personal information only in these circumstances:</p>
          <ul>
            <li><strong>With the player's club and coaches.</strong> If a player is connected to a club or team on PoseTek, that club's authorized coaches and administrators can view the player's profile, videos, performance results, workouts, and estimated active use in order to coach the player. Players are not visible to the public, or to other clubs except athletes a player chooses to connect with in the community feed.</li>
            <li><strong>With teammates.</strong> Authorized players on the same team can see teammate names and qualifying performance results in team leaderboards. This does not grant them access to another player's full private profile or recordings.</li>
            <li>
              <strong>In the community feed.</strong> The community feed is off unless PoseTek has turned it on for a club, and it may not be available to you. Where it is on:
              <ul>
                <li>a player's completed workouts and drill results (for example the drill, the result and the number of reps) appear as activity that teammates, coaches and staff in that organization can see, along with athletes the player has connected with;</li>
                <li>each player chooses in their sharing settings who sees their activity (their organization, their team, their connections, or only themselves), whether new activity is shared automatically, and whether viewers may watch saved rep videos. Unless the player changes these settings, activity is shared automatically with the player's organization and any rep videos saved to the cloud can be watched from it. A single activity can also be hidden;</li>
                <li>kudos and comments are visible to everyone who can see the activity, with the name of the person who posted them;</li>
                <li>a comment can be removed by the person who wrote it, by the athlete whose activity it is on, and by PoseTek administrators, who can also hide any activity and review reports of inappropriate content.</li>
              </ul>
            </li>
            <li><strong>With parents and guardians.</strong> A parent or guardian linked to a minor player's account can view that player's information.</li>
            <li>
              <strong>With service providers.</strong> We use vendors that process information on our behalf under contractual confidentiality and security obligations, including:
              <ul>
                <li>Google (Firebase and Google Cloud) for authentication, databases, file and video storage, hosting, analytics, and crash reporting;</li>
                <li>Google (Vertex AI) and Anthropic for generating coaching responses and training plans, and TypeSafe (Jev) for supported voice-request routing (see <a href="#ai-and-automated-processing">Section {sectionNumber("ai-and-automated-processing")}</a>);</li>
                <li>Stripe for processing payments made through our website; and</li>
                <li>Microsoft (Clarity) for website usage analytics, such as clicks, scrolling, and page interactions, on parts of posetek.net.</li>
              </ul>
            </li>
            <li><strong>For legal reasons.</strong> We may disclose information if required by law, legal process, or a valid government request, or to protect the rights, safety, and security of our users, PoseTek, or others.</li>
            <li><strong>In a business transfer.</strong> If PoseTek is involved in a merger, acquisition, financing, or sale of assets, information may be transferred as part of that transaction, subject to this Policy's protections. We will notify users of any change in ownership or in how personal information is handled.</li>
            <li><strong>With your consent or at your direction.</strong> For example, if you choose to export or share a video or result.</li>
          </ul>
          <p>We do not sell personal information, and we do not share it with third parties for their own marketing or advertising.</p>
        </PolicySection>

        <PolicySection id="childrens-privacy">
          <p>PoseTek is designed for youth soccer players, and we take the privacy of minors seriously.</p>

          <h3>Players under 13</h3>
          <ul>
            <li>We do not knowingly allow a child under 13 to create an account or provide personal information without verifiable consent from a parent or legal guardian. Accounts for players under 13 are set up through the player's club, after the club has collected consent from the player's parent or guardian.</li>
            <li>We collect from children only the information reasonably necessary to provide the Services described in this Policy: account and profile details, training videos, and performance data.</li>
            <li>We do not show advertising to children, do not use children's information for behavioral advertising, and do not make children's information publicly available.</li>
            <li>A child's information is shared only as described in <a href="#how-we-share-information">Section {sectionNumber("how-we-share-information")}</a>: with the child's linked parent or guardian, with authorized coaches and administrators at the child's own club, and with service providers that help us operate the Services.</li>
          </ul>

          <h3>Parents' and guardians' rights</h3>
          <p>A parent or guardian may at any time:</p>
          <ul>
            <li>review the personal information we hold about their child;</li>
            <li>ask us to correct or delete that information, including videos;</li>
            <li>request deletion of their child's account and all of its data, either in the app from the child's account (Profile → Account settings → Delete account) or by email;</li>
            <li>refuse to permit further collection or use of their child's information, which will end the child's use of the Services; and</li>
            <li>withdraw consent previously given.</li>
          </ul>
          <p>To exercise these rights, email <ContactEmail /> from the email address associated with the account, or contact your child's club. We will take reasonable steps to verify that the requester is the child's parent or guardian before acting.</p>
          <p>If we learn we have collected personal information from a child under 13 without the required consent, we will delete it promptly. If you believe this has happened, contact us at <ContactEmail />.</p>

          <h3>Players aged 13 to 17</h3>
          <p>We encourage teen players to use PoseTek with a parent or guardian's knowledge. The same limits apply: no advertising, no sale of personal information, and no public profiles.</p>
        </PolicySection>

        <PolicySection id="app-feedback">
          <p>Giving feedback is optional and does not affect access to results or saved progress. The updated form explains before you answer whether feedback will be linked to your signed-in account or sent anonymously. Feedback opened from a workout or results requires a signed-in account. Visitors using a shared QR code, message link or direct link can give anonymous feedback when signed out. PoseTek administrators read responses to improve the application. Please do not include additional names, contact details or other personal information in the optional comment.</p>
          <p>We store the form version, selected answers, optional comment, broad invitation source (such as workouts or results), submission time and optional time taken. When you submit through the updated form while signed in, the response also contains your account ID, account name and email address when available, and email verification status. PoseTek administrators can see this account information with the response. It identifies the signed-in account, not a verified real-world person. Feedback is not published as a public profile.</p>
          <p>Responses collected through the earlier anonymous form remain anonymous and are not linked retrospectively to accounts, players, workouts, teams or network logs. New anonymous responses contain no account author information. We do not use historical feedback or network logs to infer who submitted an anonymous response.</p>
          <p>A random identifier for each form opening deduplicates retries and counts form opens, starts and successful submissions. Form-session diagnostic records do not store the submitting account or author information. These counts describe form sessions, not individual people. The feedback page does not load session replay, analytics or advertising scripts.</p>
          <p>A browser timestamp limits automatic workout invitations to once every seven days on that browser; it is not sent with feedback. For abuse prevention, the submission service briefly processes a network address to create a secret-protected, time-window counter. These counters are separate from answers, are not used to identify players, and expire within 30 minutes of their window starting. Hosting and cloud providers may also process network addresses in their ordinary service logs.</p>
          <p>Individual feedback responses and form-session diagnostic records expire after 90 days. Database expiry removal is asynchronous, so physical deletion can follow the expiry time; expired records are excluded from the admin review. Feedback is optional even when a coach or parent shares the form.</p>
        </PolicySection>

        <PolicySection id="data-retention">
          <ul>
            <li>We keep account, profile, video, and performance information for as long as the account is active, so that players can see their progress over time.</li>
            <li>When an account is deleted, we delete the associated personal information, including training videos, within 30 days, except information we are legally required to retain. Deletion starts as soon as the request is confirmed, and a final cleanup pass runs about 24 hours later to catch anything that was still uploading, so a request normally completes about a day after it is confirmed; a request that needs a step retried still completes within the 30 days. Backups are overwritten on a rolling schedule of up to 90 days.</li>
            <li>Accounts that are inactive for 24 months may be deleted after notice to the email address on file.</li>
            <li>Detailed active-use records are retained for 90 days and daily usage summaries for 24 months. Older app builds and dates before collection began may have no usage measurements.</li>
            <li>Restricted deletion-job and receipt records are kept for up to 90 days after completion to verify the request and prevent deleted data from being restored. Removing a player from a team keeps their account and recordings; it is not account deletion.</li>
            <li>Payment records are retained as required for financial and legal compliance purposes.</li>
            <li>De-identified and aggregated data that can no longer be linked to an individual may be retained.</li>
          </ul>
        </PolicySection>

        <PolicySection id="your-choices-and-rights">
          <ul>
            <li><strong>Access and correction.</strong> You can view and update most account and profile information in the app.</li>
            <li>
              <strong>Delete your account.</strong> In the app, open Profile → Account settings → Delete account (coaches and staff open Account settings from the account icon at the top of their home screen). Confirm your identity and the permanent deletion. This deletes:
              <ul>
                <li>your account and sign-in;</li>
                <li>your athlete profile and personal details;</li>
                <li>your recordings and training videos, and the results and replays made from them;</li>
                <li>your workout logs, training plans and training history;</li>
                <li>your AI conversations, reports and AI coach memories, and your AI-sharing permission; and</li>
                <li>your community feed activity, comments, kudos and connections.</li>
              </ul>
              Deletion normally completes about a day after you confirm, and always within 30 days (see <a href="#data-retention">Data retention</a>). You can check completion using the deletion receipt on the sign-in screen. De-identified or aggregated statistics that can no longer be linked to you may remain. You may also contact <ContactEmail /> for help; email is not required to use in-app deletion, and requests by email remain available. Deletion is permanent. Deleting a coach's account does not delete their players' accounts or recordings, and removing a player from a team is not account deletion.
            </li>
            <li><strong>AI sharing.</strong> Allow, decline or withdraw AI sharing at any time in Account settings → AI sharing. In the AI coach you can review and delete its memories, or turn memory off.</li>
            <li><strong>Community feed.</strong> Where the feed is on, choose who sees your activity, whether it is shared automatically and whether rep videos can be watched, and hide individual activities.</li>
            <li><strong>Diagnostic media.</strong> Sharing diagnostic videos and images for troubleshooting is off unless you turn it on in Drill Settings, and you can turn it off at any time.</li>
            <li><strong>Permissions.</strong> You can turn off camera, microphone, speech recognition and photo library access in your device settings. Recording, warm-up tracking and Watch mode do not work without camera access, and voice mode does not work without the microphone.</li>
            <li><strong>Club connection.</strong> You can ask to disconnect from a club, which ends that club's access to the player's information going forward.</li>
          </ul>
          <p>Depending on where you live, you may have additional rights under privacy laws, such as the right to know what personal information we hold, to obtain a copy, to correct it, to delete it, and not to be discriminated against for exercising these rights. California residents: we do not sell or share personal information as those terms are defined under California law, and we do not use sensitive personal information for purposes beyond providing the Services. To make a request, email <ContactEmail />. We will verify your identity before responding and will respond within the time required by law.</p>
          <p>Our Services do not respond to browser "Do Not Track" signals because we do not track users across third-party sites.</p>
        </PolicySection>

        <PolicySection id="security">
          <p>We use reasonable administrative, technical, and physical safeguards to protect personal information, including encryption in transit, encryption at rest provided by our cloud infrastructure, role-based access controls that limit each club's staff to their own players, and restricted internal access. No method of transmission or storage is completely secure, and we cannot guarantee absolute security. If we become aware of a breach affecting your personal information, we will notify you as required by law.</p>
        </PolicySection>

        <PolicySection id="where-information-is-processed">
          <p>PoseTek is based in the United States, and information is processed and stored in the United States. If you use the Services from outside the United States, your information will be transferred to and processed in the United States, where privacy laws may differ from those in your location.</p>
        </PolicySection>

        <PolicySection id="changes-to-this-policy">
          <p>We may update this Policy from time to time. If we make material changes, we will notify you in the app or by email before the changes take effect, and where required we will request renewed parental consent. The "Last updated" date at the top shows when this Policy was last revised.</p>
        </PolicySection>

        <PolicySection id="contact-us">
          <address className="contact-box">
            <strong>PoseTek Inc.</strong><br />
            3618 Cameron Avenue<br />
            Pleasanton, California<br />
            Email: <ContactEmail />
          </address>
        </PolicySection>
      </main>

      <footer>
        <p>© 2026 PoseTek · <Link to="/">Home</Link> · <Link to="/support">Support</Link> · <Link to="/privacy" onClick={() => window.scrollTo(0, 0)}>Privacy Policy</Link></p>
      </footer>
    </div>
  );
}
