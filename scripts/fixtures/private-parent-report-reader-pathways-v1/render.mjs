let pdfUrl;

/** Presentation hints only; neither platform nor app installation is verified. */
export function workoutPlatform(hints = globalThis.navigator) {
  const agent = typeof hints?.userAgent === 'string' ? hints.userAgent : '';
  if (/Android/i.test(agent)) return 'android';
  if (/iPad|iPhone|iPod/i.test(agent) ||
      (/Macintosh|MacIntel/i.test(agent) && hints?.maxTouchPoints > 1)) return 'ios';
  return 'unknown';
}

/** Locators carry no report key, credentials, or authorization. */
export function workoutLinks(playerId) {
  if (typeof playerId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(playerId)) {
    return null;
  }
  const query = `player=${encodeURIComponent(playerId)}&view=training`;
  return {
    browser: `https://posetek.net/athlete?${query}`,
    native: `posetek-workouts-v1://athlete?${query}`,
    install: 'https://testflight.apple.com/join/3byuBWYW',
  };
}

/** Verified canonical invitation URLs are carried only inside authorized encrypted reports. */
export function playerSignupLink(signupUrl, playerId) {
  if (!workoutLinks(playerId) || typeof signupUrl !== 'string' || signupUrl.length > 600) throw new Error('Invalid player signup entry');
  const url = new URL(signupUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const codes = fragment.getAll('playerCode');
  if (url.origin !== 'https://posetek.net' || url.pathname !== '/signin' || url.username || url.password || url.search ||
      [...fragment.keys()].length !== 1 || codes.length !== 1 || !/^[A-Za-z0-9-]{6,64}$/.test(codes[0])) throw new Error('Invalid player signup entry');
  return `/signin?reportPlayer=${encodeURIComponent(playerId)}#playerCode=${encodeURIComponent(codes[0])}`;
}

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


const PATHWAY_METRICS = [
  {key: 'speedAt5m', unit: 'mph'},
  {key: 'verticalJump', unit: 'in'},
  {key: 'broadJump', unit: 'ft'},
];
const PLACEMENT_STATES = ['placed', 'age-unverified', 'sex-unverified', 'no-valid-result', 'sparse-reference', 'no-reference'];
function measured(value) { return Number.isFinite(value) && value >= 0 && value <= 1000; }
function ageGroup(value) { return Number.isInteger(value) && value >= 8 && value <= 17; }

/** Optional aggregate-only extension. Legacy v1 payloads keep their existing presentation. */
export function validatePathwayCharts(charts, version) {
  if (charts === undefined && version === undefined) return false;
  if (version !== 1 || !Array.isArray(charts) || charts.length !== 3) throw new Error('Invalid pathway charts');
  for (const [index, chart] of charts.entries()) {
    const metric = PATHWAY_METRICS[index];
    if (!chart || chart.key !== metric.key || chart.unit !== metric.unit || chart.direction !== 'higher') throw new Error('Invalid pathway metric');
    string(chart.label, 'pathway label', 160);
    const reference = chart.reference, athlete = chart.athlete;
    if (!reference || !['girls', 'boys', null].includes(reference.sexReferenceGroup)) throw new Error('Invalid reference group');
    for (const key of ['label', 'sourceDate', 'selectionRule']) string(reference[key], 'reference ' + key, 600);
    if (!athlete || !PLACEMENT_STATES.includes(athlete.placementStatus) ||
        (athlete.ageGroup !== null && !ageGroup(athlete.ageGroup)) ||
        (athlete.value !== null && !measured(athlete.value)) ||
        (athlete.percentile !== null && (!Number.isFinite(athlete.percentile) || athlete.percentile < 0 || athlete.percentile > 100))) throw new Error('Invalid athlete placement');
    if (!Array.isArray(chart.groups) || chart.groups.length !== 10) throw new Error('Invalid age groups');
    for (const [i, group] of chart.groups.entries()) {
      if (!group || group.ageGroup !== i + 8 || !Number.isInteger(group.n) || group.n < 0 || group.n > 10000) throw new Error('Invalid age group');
      const status = group.n === 0 ? 'missing' : group.n < 5 ? 'sparse' : 'available';
      if (group.status !== status) throw new Error('Invalid group status');
      if (group.status !== 'available') {
        if (group.median !== null || (group.density !== undefined && (!Array.isArray(group.density) || group.density.length))) throw new Error('Sparse groups cannot show a distribution');
      } else {
        if (!measured(group.median) || !Array.isArray(group.density) || group.density.length < 2 || group.density.length > 64) throw new Error('Invalid distribution');
        let previous = -1, nonzero = false;
        for (const point of group.density) {
          if (!point || !measured(point.value) || point.value <= previous || !Number.isFinite(point.weight) || point.weight < 0 || point.weight > 1) throw new Error('Invalid density point');
          previous = point.value; nonzero ||= point.weight > 0;
        }
        if (!nonzero || group.median < group.density[0].value || group.median > group.density.at(-1).value) throw new Error('Invalid distribution range');
      }
      if (reference.sexReferenceGroup === null && group.n !== 0) throw new Error('Unverified reference group');
      if ('values' in group || 'players' in group || 'rows' in group) throw new Error('Raw peer results are not permitted');
    }
    const ownGroup = chart.groups.find(group => group.ageGroup === athlete.ageGroup);
    const plotted = ['placed', 'sparse-reference', 'no-reference'].includes(athlete.placementStatus);
    if (plotted && (!ageGroup(athlete.ageGroup) || !measured(athlete.value) || reference.sexReferenceGroup === null)) throw new Error('Unverified plotted placement');
    if (athlete.placementStatus === 'placed' && ownGroup?.status !== 'available') throw new Error('Insufficient comparison');
    if (athlete.placementStatus === 'sparse-reference' && ownGroup?.status !== 'sparse') throw new Error('Invalid sparse placement');
    if (athlete.placementStatus === 'no-reference' && ownGroup?.status !== 'missing') throw new Error('Invalid missing placement');
    if (athlete.placementStatus === 'age-unverified' && athlete.ageGroup !== null) throw new Error('Unverified age must be absent');
    if (athlete.placementStatus === 'no-valid-result' && athlete.value !== null) throw new Error('Unqualified result must be absent');
    if (athlete.percentile !== null && athlete.placementStatus !== 'placed') throw new Error('Unsupported percentile');
    for (const note of array(chart.notes, 'pathway notes', 6)) string(note, 'pathway note', 600);
  }
  return true;
}

function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function numberLabel(value) { return new Intl.NumberFormat('en-US', {maximumFractionDigits: 1}).format(value); }
function placementText(chart) {
  const athlete = chart.athlete;
  if (athlete.placementStatus === 'placed') {
    const group = chart.groups.find(group => group.ageGroup === athlete.ageGroup);
    return athlete.percentile === null
      ? `Shown with ${group.n} tested U${athlete.ageGroup} ${chart.reference.sexReferenceGroup}.`
      : `About the ${ordinal(athlete.percentile)} percentile among ${group.n} tested U${athlete.ageGroup} ${chart.reference.sexReferenceGroup}.`;
  }
  return {
    'age-unverified': 'Age group needs confirmation, so this result is not placed on the chart.',
    'sex-unverified': 'The reference group needs confirmation, so this result is not placed on the chart.',
    'no-valid-result': 'No qualified result is available for this test yet.',
    'sparse-reference': 'Fewer than 5 comparable athletes in this age group; no percentile is shown.',
    'no-reference': 'No comparable results are available for this age group yet.',
  }[athlete.placementStatus];
}

function makePathwayChart(chart, firstName) {
  const section = element('section', 'pt-pathway');
  section.dataset.metric = chart.key;
  const heading = element('div', 'pt-pathway-heading');
  heading.append(element('h3', '', chart.label), element('span', 'pt-pathway-result', chart.athlete.value === null ? 'Not available' : `${numberLabel(chart.athlete.value)} ${chart.unit}`));
  section.append(heading, element('p', 'pt-pathway-placement', placementText(chart)));
  const plotted = ['placed', 'sparse-reference', 'no-reference'].includes(chart.athlete.placementStatus);
  const values = chart.groups.flatMap(group => group.density?.map(point => point.value) || []);
  if (plotted) values.push(chart.athlete.value);
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * 0.08, high * 0.04, 0.1);
  const minimum = Math.max(0, low - padding), maximum = high + padding;
  const left = 38, top = 12, bottom = 195, width = 350, column = width / 10;
  const y = value => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);
  const x = age => left + (age - 8 + 0.5) * column;
  const svg = svgElement('svg', {viewBox: '0 0 400 250', role: 'img', 'aria-label': `${chart.label}, ${chart.unit}, by age group. ${placementText(chart)} Blank columns have fewer than 5 comparable results.`});
  svg.append(svgElement('title', {}, `${chart.label}: ${firstName} and tested Vacaville age groups`));
  for (let tick = 0; values.length && tick <= 4; tick++) {
    const value = minimum + (maximum - minimum) * tick / 4;
    svg.append(svgElement('line', {x1: left, x2: left + width, y1: y(value), y2: y(value), class: 'pt-pathway-grid'}));
    svg.append(svgElement('text', {x: left - 6, y: y(value) + 4, 'text-anchor': 'end', class: 'pt-pathway-axis'}, numberLabel(value)));
  }
  let previous;
  for (const group of chart.groups) {
    const center = x(group.ageGroup);
    if (group.status === 'available') {
      for (let i = 0; i < group.density.length - 1; i++) {
        const point = group.density[i], next = group.density[i + 1];
        svg.append(svgElement('rect', {x: center - column * 0.39, y: y(next.value), width: column * 0.78, height: Math.max(0.1, y(point.value) - y(next.value) + 0.1), 'fill-opacity': ((point.weight + next.weight) / 2) * 0.85, class: 'pt-pathway-density', 'data-age': group.ageGroup}));
      }
      if (previous) svg.append(svgElement('line', {x1: x(previous.ageGroup), y1: y(previous.median), x2: center, y2: y(group.median), class: 'pt-pathway-median'}));
      svg.append(svgElement('circle', {cx: center, cy: y(group.median), r: 2.5, class: 'pt-pathway-median-dot'}));
      previous = group;
    } else {
      previous = undefined; // Never interpolate or connect across sparse or missing ages.
    }
    svg.append(svgElement('text', {x: center, y: 214, 'text-anchor': 'middle', class: 'pt-pathway-axis'}, `U${group.ageGroup}`));
    svg.append(svgElement('text', {x: center, y: 229, 'text-anchor': 'middle', class: 'pt-pathway-count'}, group.n ? `n=${group.n}` : '—'));
  }
  if (plotted) svg.append(svgElement('circle', {cx: x(chart.athlete.ageGroup), cy: y(chart.athlete.value), r: 5.5, class: 'pt-pathway-athlete'}));
  const scroll = element('div', 'pt-pathway-scroll');
  scroll.setAttribute('tabindex', '0'); scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `${chart.label} chart; scroll horizontally on small screens`);
  if (plotted && chart.athlete.ageGroup >= 13) scroll.dataset.preferEnd = 'true';
  scroll.append(svg);
  section.append(scroll, element('p', 'pt-pathway-axis-title', `${chart.unit} · higher is better · age group`));
  return section;
}

function makePathways(report) {
  const section = element('section', 'pt-pathways');
  section.append(element('h2', 'pt-practice-title', 'Your results by age group'));
  section.append(element('p', 'pt-provisional', 'Compared with tested Vacaville players. These charts describe today’s results, not future progress.'));
  const legend = element('div', 'pt-pathway-legend');
  for (const [className, label] of [['pt-density-key', 'More results here'], ['pt-median-key', 'Age-group middle'], ['pt-athlete-key', report.firstName]]) {
    const item = element('span'); item.append(element('i', className), document.createTextNode(label)); legend.append(item);
  }
  section.append(legend, element('p', 'pt-pathway-note', 'Each shaded column uses its own scale. Gaps mean fewer than 5 comparable athletes; — means no results.'));
  for (const chart of report.pathwayCharts) section.append(makePathwayChart(chart, report.firstName));
  return section;
}

function makeCorrectedResults(report) {
  const section = element('section', 'pt-corrected-results');
  section.append(element('h2', 'pt-practice-title', 'This testing session'));
  const list = element('dl');
  for (const metric of report.metrics) {
    list.append(element('dt', '', metric.label), element('dd', '', metric.result || 'Not available'));
  }
  section.append(list);
  const details = element('details', 'pt-details');
  details.append(element('summary', '', 'About these results'));
  const content = element('div', 'pt-detail-content');
  for (const chart of report.pathwayCharts) {
    content.append(element('p', '', `${chart.label}: ${chart.reference.label}. Reference checked ${chart.reference.sourceDate}. ${chart.reference.selectionRule}`));
  }
  const sharedNotes = new Set([...report.pathwayCharts.flatMap(chart => chart.notes), ...report.methodNotes]);
  for (const note of sharedNotes) content.append(element('p', '', note));
  for (const metric of report.metrics) if (metric.note) content.append(element('p', '', `${metric.label}: ${metric.note}`));
  details.append(content); section.append(details);
  return section;
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
  validatePathwayCharts(report.pathwayCharts, report.pathwayVersion);
  if (report.pathwayCoverage !== undefined) {
    if (!report.pathwayCharts || !report.pathwayCoverage || typeof report.pathwayCoverage.broaderComparisonsPending !== 'boolean') throw new Error('Invalid pathway coverage');
    string(report.pathwayCoverage.note, 'pathway coverage', 300);
  }
  if (report.playerSignupUrl !== undefined) playerSignupLink(report.playerSignupUrl, report.playerId);
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

function workoutAnchor(text, href, className = 'pt-recovery-link') {
  const link = element('a', className, text);
  link.href = href;
  if (href.startsWith('https://')) link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  return link;
}

function makeWorkoutEntry(report) {
  const links = workoutLinks(report.playerId);
  const entry = element('div', 'pt-workout-entry');
  if (!links) {
    entry.append(element('p', 'pt-cta-note', 'Workouts aren’t available from this report.'));
    return entry;
  }
  const platform = workoutPlatform();
  if (report.playerSignupUrl !== undefined) {
    entry.append(workoutAnchor(`Open ${report.firstName}’s workouts`, playerSignupLink(report.playerSignupUrl, report.playerId), 'pt-primary'));
    entry.append(element('p', 'pt-cta-note', `First, create ${report.firstName}’s player login with the filled-in code, or sign in if it’s already set up.`));
    const signIn = `/signin?reportPlayer=${encodeURIComponent(report.playerId)}`;
    entry.append(workoutAnchor('Already have the player login? Sign in', signIn));
    if (platform !== 'android') {
      const recovery = element('details', 'pt-app-options');
      recovery.append(element('summary', '', 'Already set up? Open the iPhone or iPad app'));
      const choices = element('div', 'pt-recovery-links');
      choices.append(workoutAnchor('Open in the PoseTek app', links.native));
      recovery.append(choices, makeInstallSteps(links));
      entry.append(recovery);
    }
    return entry;
  }
  if (platform === 'ios') {
    // Keep install guidance visible before a tap; platform hints cannot detect installation.
    entry.append(workoutAnchor('Open in the PoseTek app', links.native, 'pt-primary'));
    entry.append(element('p', 'pt-cta-note', `Already have PoseTek? Sign in with ${report.firstName}’s player login.`));
    entry.append(makeInstallSteps(links));
    entry.append(element('p', 'pt-cta-note',
      'If the app doesn’t open, try Install or update PoseTek above, then come back and tap again. You can also continue in your browser.'));
    const browser = element('div', 'pt-recovery-links');
    browser.append(workoutAnchor('Continue in browser instead', links.browser));
    entry.append(browser);
  } else {
    entry.append(workoutAnchor(`Open ${report.firstName}’s workouts`, links.browser, 'pt-primary'));
    entry.append(element('p', 'pt-cta-note', 'Opens PoseTek in your browser. Sign in if asked.'));
    if (platform !== 'android') {
      const recovery = element('details', 'pt-app-options');
      recovery.append(element('summary', '', 'Using an iPhone or iPad?'));
      const choices = element('div', 'pt-recovery-links');
      choices.append(workoutAnchor('Open in the PoseTek app', links.native));
      recovery.append(choices, makeInstallSteps(links));
      entry.append(recovery);
    }
  }
  entry.append(element('p', 'pt-cta-note', 'New here? Use your private invitation.'));
  return entry;
}

function makeInstallSteps(links) {
  const steps = element('div', 'pt-install');
  steps.append(element('p', 'pt-install-title', 'Don’t have PoseTek yet?'));
  const list = element('ol', 'pt-install-list');
  const install = element('li');
  install.append(workoutAnchor('Install or update PoseTek', links.install), ' through Apple’s TestFlight.');
  list.append(install, element('li', '', 'Come back to this report and tap Open in the PoseTek app.'));
  steps.append(list);
  return steps;
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
  header.append(element('h1', '', `${report.firstName}’s ${report.pathwayCharts ? 'testing' : 'team'} snapshot`));
  header.append(element('p', '', `${report.name} · ${report.team}`));
  header.append(element('p', '', `Coach ${report.coach} · Tested ${report.testDate}`));
  if (report.pathwayCoverage) header.append(element('p', 'pt-coverage', report.pathwayCoverage.note));
  const main = element('main', 'pt-body');
  const focus = element('section', 'pt-focus');
  focus.append(element('h2', '', report.focusTitle), element('p', '', report.focusText));
  main.append(focus);

  const actions = element('div', 'pt-actions');
  actions.append(makeWorkoutEntry(report));
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

  if (report.pathwayCharts) {
    main.append(makePathways(report), makeCorrectedResults(report));
  } else {
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
  }
  const meaning = element('section', 'pt-meaning');
  meaning.setAttribute('aria-label', 'What to work on next');
  for (const summary of report.summary) {
    const row = element('p');
    row.append(element('strong', '', summary.label), element('span', '', summary.text));
    meaning.append(row);
  }
  if (report.summary.length) main.append(meaning);
  if (!report.pathwayCharts) main.append(makeDetails(report));
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
  main.append(actions);
  main.append(element('p', 'pt-private-note', 'Keep this link within your family.'));
  phone.append(header, main);
  pdfUrl = URL.createObjectURL(new Blob([pdf], {type: 'application/pdf'}));
  mount.replaceChildren(phone);
  mount.hidden = false;
  for (const scroll of mount.querySelectorAll('.pt-pathway-scroll[data-prefer-end]')) scroll.scrollLeft = 400;
  const status = document.getElementById('report-status');
  if (status) status.hidden = true;
}
