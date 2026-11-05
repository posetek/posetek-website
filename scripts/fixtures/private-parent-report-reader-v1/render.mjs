let pdfUrl;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function string(value, field, maximum = 600) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function array(value, field, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`Invalid ${field}`);
  return value;
}

function display(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function ordinal(value) {
  const integer = Math.round(value);
  const tens = integer % 100;
  if (tens >= 11 && tens <= 13) return `${integer}th`;
  return `${integer}${({1: 'st', 2: 'nd', 3: 'rd'})[integer % 10] || 'th'}`;
}

function validate(report) {
  if (!report || typeof report !== 'object' || report.version !== 1) throw new Error('Invalid report');
  for (const field of ['name', 'firstName', 'team', 'coach', 'testDate', 'focusTitle', 'focusText', 'playerId']) {
    string(report[field], field);
  }
  for (const metric of array(report.metrics, 'metrics', 16)) {
    string(metric.label, 'metric label', 160);
    if (metric.percentile !== null || metric.result !== null) string(metric.result, 'metric result', 160);
    string(metric.band, 'metric band', 40);
    if (metric.percentile !== null && (!Number.isFinite(metric.percentile) || metric.percentile < 0 || metric.percentile > 100)) {
      throw new Error('Invalid percentile');
    }
    if (metric.average !== null && metric.average !== undefined) string(metric.average, 'metric average', 160);
    if (metric.count !== null && metric.count !== undefined && (!Number.isInteger(metric.count) || metric.count < 0)) {
      throw new Error('Invalid comparison count');
    }
    if (metric.note) string(metric.note, 'metric note');
  }
  for (const item of array(report.summary, 'summary', 6)) {
    string(item.label, 'summary label', 160);
    string(item.text, 'summary text');
  }
  for (const exercise of array(report.exercises, 'exercises', 6)) {
    for (const field of ['title', 'tag', 'dose', 'instruction']) string(exercise[field], `exercise ${field}`);
  }
  for (const note of array(report.methodNotes, 'method notes', 16)) string(note, 'method note', 1800);
  const encoded = string(report.pdfBase64, 'PDF', 1_800_000);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid PDF encoding');
  const decoded = atob(encoded);
  if (!decoded.startsWith('%PDF-')) throw new Error('Invalid PDF');
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

/** Remove the previous private report and release its downloadable PDF. */
export function clearReport() {
  const mount = document.getElementById('report-root');
  if (mount) {
    mount.hidden = true;
    mount.replaceChildren();
  }
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = undefined;
}

function makeMetric(metric) {
  if (metric.percentile === null) {
    const row = element('div', 'pt-retest');
    const label = element('div', '', metric.label);
    if (metric.note) label.append(element('small', '', metric.note));
    row.append(label, element('strong', '', metric.result || 'Retest'));
    return row;
  }
  const row = element('div', 'pt-metric');
  const head = element('div', 'pt-metric-head');
  const name = element('span', 'pt-metric-name', metric.label);
  name.append(element('span', 'pt-result', metric.result));
  head.append(name, element('span', 'pt-percentile', `~${ordinal(metric.percentile)}`));
  const track = element('div', 'pt-track');
  track.setAttribute('role', 'img');
  track.setAttribute('aria-label', `${metric.label}: ${metric.result}, approximately ${ordinal(metric.percentile)} team percentile, ${metric.band}`);
  track.append(element('span'), element('span'), element('span'));
  const marker = element('i', 'pt-marker');
  marker.style.left = `${metric.percentile}%`;
  track.append(marker);
  row.append(head, track);
  return row;
}

function makeDetails(report) {
  const details = element('details', 'pt-details');
  details.append(element('summary', '', 'How to read this + team averages'));
  const content = element('div', 'pt-detail-content');
  content.append(element('p', '', 'Further right means a more favorable result in this team’s testing session. 50th is the team middle; around 90th is near the top of this session.'));
  content.append(element('p', '', 'Practice: below 25th. Team middle: 25th to below 75th. Strong: 75th and above. These are report bands, not age or national standards.'));
  const table = element('table');
  table.setAttribute('aria-label', 'Team averages and number of results');
  const head = element('thead');
  const labels = element('tr');
  for (const text of ['Test', 'Team average', 'Results']) {
    const cell = element('th', '', text);
    cell.setAttribute('scope', 'col');
    labels.append(cell);
  }
  head.append(labels);
  const body = element('tbody');
  for (const metric of report.metrics) {
    const row = element('tr');
    row.append(element('td', '', metric.label), element('td', '', display(metric.average)), element('td', '', display(metric.count)));
    body.append(row);
  }
  table.append(head, body);
  content.append(table);
  for (const note of report.methodNotes) content.append(element('p', '', note));
  for (const metric of report.metrics) {
    if (metric.note && metric.percentile !== null) content.append(element('p', '', `${metric.label}: ${metric.note}`));
  }
  details.append(content);
  return details;
}

/** Render only an already-decrypted report. Report strings are always plain text. */
export function renderReport(report) {
  clearReport();
  const pdf = validate(report);
  const mount = document.getElementById('report-root');
  if (!mount) throw new Error('Missing report mount');
  const phone = element('article', 'pt-phone');
  const header = element('header', 'pt-top');
  header.append(element('div', 'pt-brand', 'POSETEK'));
  header.append(element('h1', '', `${report.firstName}’s team snapshot`));
  header.append(element('p', '', `${report.name} · ${report.team}`));
  header.append(element('p', '', `Coach ${report.coach} · Tested ${report.testDate}`));
  const main = element('main', 'pt-body');
  const focus = element('section', 'pt-focus');
  focus.append(element('h2', '', report.focusTitle), element('p', '', report.focusText));
  main.append(focus);

  const actions = element('div', 'pt-actions');
  const workout = element('a', 'pt-primary', `Open ${report.firstName}’s workouts`);
  workout.href = `https://posetek.net/athlete?player=${encodeURIComponent(report.playerId)}&view=training`;
  workout.target = '_blank';
  workout.rel = 'noopener noreferrer';
  workout.referrerPolicy = 'no-referrer';
  actions.append(workout, element('p', 'pt-cta-note', 'Opens PoseTek in your browser. Sign in if asked.'));
  actions.append(element('p', 'pt-cta-note', 'New here? Use your private invitation.'));
  const downloadRow = element('div', 'pt-download-row');
  const download = element('button', 'pt-quiet-button', 'Download PDF');
  download.type = 'button';
  download.addEventListener('click', () => {
    if (!pdfUrl) return;
    const anchor = element('a');
    anchor.href = pdfUrl;
    anchor.download = 'posetek-parent-report.pdf';
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  });
  downloadRow.append(download);
  actions.append(downloadRow);
  main.append(actions);

  const sectionTitle = element('div', 'pt-section-title');
  const personal = element('span', 'pt-you');
  personal.append(element('span', 'pt-dot'), element('span', '', report.firstName));
  sectionTitle.append(element('h2', '', `Where ${report.firstName} stands`), personal);
  main.append(sectionTitle, element('p', 'pt-provisional', 'Approximate team percentiles · this testing session'));
  const zones = element('div', 'pt-zones');
  zones.setAttribute('aria-label', 'Team percentile bands');
  for (const zone of ['Practice', 'Team middle', 'Strong']) zones.append(element('span', '', zone));
  main.append(zones);
  for (const metric of report.metrics) main.append(makeMetric(metric));
  const meaning = element('section', 'pt-meaning');
  meaning.setAttribute('aria-label', 'What to work on next');
  for (const summary of report.summary) {
    const row = element('p');
    row.append(element('strong', '', summary.label), element('span', '', summary.text));
    meaning.append(row);
  }
  main.append(meaning, makeDetails(report));
  if (report.exercises.length) {
    const practice = element('section');
    practice.append(element('h2', 'pt-practice-title', 'A little practice to get started'));
    for (const exercise of report.exercises) {
      const drill = element('article', 'pt-drill');
      const top = element('div', 'pt-drill-top');
      top.append(element('h3', '', exercise.title), element('span', 'pt-drill-tag', exercise.tag));
      drill.append(top, element('p', 'pt-dose', exercise.dose), element('p', '', exercise.instruction));
      practice.append(drill);
    }
    practice.append(element('p', 'pt-safety', 'Clear, flat space. Stop if anything hurts.'));
    main.append(practice);
  }
  main.append(element('p', 'pt-private-note', 'Keep this link within your family.'));
  phone.append(header, main);
  pdfUrl = URL.createObjectURL(new Blob([pdf], {type: 'application/pdf'}));
  mount.replaceChildren(phone);
  mount.hidden = false;
  const status = document.getElementById('report-status');
  if (status) status.hidden = true;
}
