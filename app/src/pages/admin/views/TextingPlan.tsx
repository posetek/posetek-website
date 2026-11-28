import { useState } from "react";

const providers = [
  { name: "Telnyx", number: 1.1, segment: 0.0055, url: "https://telnyx.com/pricing/toll-free" },
  { name: "SignalWire", number: 0.8, segment: 0.0068, url: "https://signalwire.com/pricing" },
  { name: "Twilio", number: 2.15, segment: 0.0083, url: "https://www.twilio.com/en-us/sms/pricing/us" },
];

const examples = [
  { label: "Handset test", sent: 1, received: 1 },
  { label: "Club pilot", sent: 300, received: 60 },
  { label: "Larger rollout", sent: 1000, received: 200 },
];

export function TextingPlan() {
  const [example, setExample] = useState(1);
  const { sent, received } = examples[example];
  return (
    <section className="messaging-panel" aria-labelledby="texting-plan-heading">
      <h2 id="texting-plan-heading">Texting plan</h2>
      <dl className="messaging-setup">
        <div>
          <dt>Staff pilot provider</dt>
          <dd>Telnyx</dd>
        </div>
        <div>
          <dt>Messaging profile</dt>
          <dd>Created for U.S. messaging only</dd>
        </div>
        <div>
          <dt>Company number</dt>
          <dd>Awaiting an approved number</dd>
        </div>
        <div>
          <dt>Reply callback</dt>
          <dd>Awaiting setup</dd>
        </div>
        <div>
          <dt>Setup updated</dt>
          <dd>Nov 28, 2026</dd>
        </div>
      </dl>
      <div className="messaging-estimate">
        <h3>Monthly cost comparison</h3>
        <label htmlFor="sms-volume">Example volume</label>
        <select id="sms-volume" value={example} onChange={(event) => setExample(Number(event.target.value))}>
          {examples.map(({ label, sent: out, received: incoming }, index) => (
            <option key={label} value={index}>
              {label} · {out.toLocaleString("en-US")} sent / {incoming} received
            </option>
          ))}
        </select>
      </div>
      <table className="messaging-rates">
        <caption>Rates published Nov 27, 2026. One U.S. toll-free number. SMS rates in USD per billed segment.</caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Number / mo</th>
            <th scope="col">Send or receive</th>
            <th scope="col">Base / mo</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.name}>
              <th scope="row">
                <a href={provider.url}>{provider.name}</a>
              </th>
              <td>${provider.number.toFixed(2)}</td>
              <td>${provider.segment.toFixed(4)}</td>
              <td>
                <strong>${(provider.number + (sent + received) * provider.segment).toFixed(2)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="messaging-note">
        Estimates exclude carrier fees and taxes. Long texts can use several segments. Telnyx includes the{" "}
        <a href="https://telnyx.com/pricing/numbers">SMS number add-on</a>.
      </p>
      <p className="messaging-note">
        The staff handset test will check that a reminder arrives and its reply reaches the Vacaville inbox.
      </p>
    </section>
  );
}
