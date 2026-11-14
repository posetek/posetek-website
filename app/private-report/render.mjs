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


/** Saved-plan references are descriptive only, never authorization or mutable URLs. */
export function validateDevelopment(development, exercises, focused = false) {
  if (development === undefined) return false;
  const d = development;
  if (!d || d.version !== 1) throw new Error('Invalid development extension');
  if (!focused || d.charts !== undefined) validatePathwayCharts(d.charts, 1);
  if (!['verified', 'general', 'conflict'].includes(d.positionStatus)) throw new Error('Invalid position status');
  string(d.positionLabel, 'position label', 160);
  string(d.positionNote, 'position note');
  for (const key of ['strengths', 'priorities']) {
    for (const item of array(d[key], key, 2)) {
      string(item.title, key + ' title', 160);
      string(item.text, key + ' text');
      if (!['measured', 'position', 'recorded'].includes(item.basis)) throw new Error('Invalid development basis');
      for (const id of array(item.drillIds, 'priority drill references', 12)) string(id, 'drill id', 128);
    }
  }
  if (!d.plan) throw new Error('Missing saved plan');
  for (const key of focused ? ['id'] : ['id', 'summary', 'schedule', 'progression', 'assumptions']) string(d.plan[key], 'plan ' + key);
  if (!Array.isArray(exercises) || exercises.length !== 2) throw new Error('Two saved-plan drills required');
  for (const exercise of exercises) {
    for (const key of ['drillId', 'workoutId', 'equipment', 'why']) string(exercise[key], 'exercise ' + key);
    if (exercise.planId !== d.plan.id) throw new Error('Drill and plan disagree');
  }
  return true;
}

function makeDevelopment(report) {
  const d = report.development;
  const section = element('section', 'pt-development');
  if (report.layout !== 'focused-v1') {
  const pathways = makePathways({...report, pathwayCharts: d.charts});
  pathways.classList.add('pt-pathways-compact');
  pathways.querySelector('h2').textContent = 'Developmental pathway';
  section.append(pathways);
  }
  for (const [key, title] of [['strengths', 'What you’re doing well'], ['priorities', 'What we’ll build next']]) {
    const part = element('section', 'pt-development-part');
    part.append(element('h2', 'pt-practice-title', title));
    for (const item of d[key]) {
      const p = element('p');
      p.append(element('strong', '', item.title + '. '), document.createTextNode(item.text));
      part.append(p);
    }
    section.append(part);
  }
  if (report.layout === 'focused-v1') return section;
  const plan = element('section', 'pt-development-part pt-plan');
  plan.append(element('h2', 'pt-practice-title', 'Your training plan'));
  plan.append(element('p', 'pt-position', d.positionLabel + ' · ' + d.positionNote));
  for (const key of ['summary', 'schedule', 'progression']) plan.append(element('p', '', d.plan[key]));
  plan.append(element('p', 'pt-assumptions', d.plan.assumptions));
  section.append(plan);
  return section;
}

const COMPARISON_LAYOUT = 'score-cards-v2';
const STATS_METRICS = {
  dribbleLeft: { unit: 's', curveUnit: 'm/s', digits: 2, more: 'slower', less: 'faster' },
  dribbleRight: { unit: 's', curveUnit: 'm/s', digits: 2, more: 'slower', less: 'faster' },
  sprint: { unit: 's', curveUnit: 'mph', digits: 2, more: 'slower', less: 'faster' },
  changeOfDirection: { unit: 's', curveUnit: 'm/s', digits: 2, more: 'slower', less: 'faster' },
  jump: { unit: 'in', curveUnit: 'in', digits: 1, more: 'higher', less: 'lower' },
  broadJump: { unit: 'ft', curveUnit: 'ft', digits: 1, more: 'farther', less: 'shorter' },
};

function onlyKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key));
}

function validateScoreComparisons(report) {
  if (report.resultsFirst !== true || report.layout !== undefined || report.development !== undefined ||
      report.pathwayCharts !== undefined || report.exercises.length || !report.metrics.length ||
      (report.reportKind !== undefined && !['event', 'individual'].includes(report.reportKind))) {
    throw new Error('Invalid Stats comparison layout');
  }
  const keys = new Set();
  for (const metric of report.metrics) {
    const spec = Object.hasOwn(STATS_METRICS, metric.key) ? STATS_METRICS[metric.key] : null;
    if (!spec || keys.has(metric.key) ||
        !['measured', 'estimate', 'retest', 'unavailable'].includes(metric.status)) throw new Error('Invalid Stats metric');
    keys.add(metric.key);
    if (metric.estimatedCount !== undefined && (!Number.isInteger(metric.estimatedCount) ||
        metric.estimatedCount < 0 || metric.estimatedCount > (metric.count ?? 0))) throw new Error('Invalid estimated count');
    const hasResult = metric.status === 'measured' || metric.status === 'estimate';
    if (hasResult !== (metric.result !== null) || (!hasResult && metric.percentile !== null)) {
      throw new Error('Invalid Stats result status');
    }
    const comparison = metric.comparison;
    if (comparison !== undefined && (report.reportKind === 'individual' || !hasResult || !onlyKeys(comparison, ['value', 'median', 'count']) ||
        !measured(comparison.value) || comparison.value <= 0 || !measured(comparison.median) || comparison.median <= 0 ||
        !Number.isInteger(comparison.count) || comparison.count < 5)) throw new Error('Invalid team comparison');

    const curve = metric.curve;
    if (curve === undefined) continue;
    if (!onlyKeys(curve, ['label', 'unit', 'cohort', 'through', 'points', 'own']) || curve.unit !== spec.curveUnit) {
      throw new Error('Invalid developmental curve');
    }
    string(curve.label, 'curve label', 90);
    string(curve.cohort, 'curve cohort', 140);
    if (curve.through != null && (typeof curve.through !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(curve.through))) {
      throw new Error('Invalid curve source date');
    }
    const points = array(curve.points, 'curve points', 121);
    let lastAge = 0;
    if (points.length < 2) throw new Error('Invalid curve points');
    for (const point of points) {
      if (!onlyKeys(point, ['age', 'mean', 'sd']) || !Number.isFinite(point.age) || point.age < 4 ||
          point.age > 25 || point.age <= lastAge || !measured(point.mean) || point.mean <= 0 || !measured(point.sd)) {
        throw new Error('Invalid curve point');
      }
      lastAge = point.age;
    }
    if (curve.own !== undefined && (!onlyKeys(curve.own, ['age', 'value', 'average']) || !Number.isInteger(curve.own.age) ||
        curve.own.age < 5 || curve.own.age > 24 || !measured(curve.own.value) || curve.own.value <= 0 ||
        (curve.own.average !== undefined && (!measured(curve.own.average) || curve.own.average <= 0)))) {
      throw new Error('Invalid developmental placement');
    }
  }
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
  if (report.layout !== undefined && report.layout !== 'focused-v1') throw new Error('Invalid report layout');
  const focused = report.layout === 'focused-v1';
  if (focused && (!report.development || report.resultsFirst !== true)) throw new Error('Focused report requires saved-plan findings');
  validateDevelopment(report.development, report.exercises, focused);
  if (focused) validateFocusedMetrics(report.metrics);
  if (report.visualLayout === COMPARISON_LAYOUT) validateScoreComparisons(report);
  if (report.workoutEntry !== undefined && (report.workoutEntry !== 'stats' ||
      report.visualLayout !== COMPARISON_LAYOUT || report.resultsFirst !== true ||
      report.playerSignupUrl !== undefined || !workoutLinks(report.playerId))) {
    throw new Error('Invalid existing-player workout entry');
  }
  if (report.development && (report.pathwayCharts || report.resultsFirst !== true)) throw new Error('Development requires results-first classic layout');
  if (report.pathwayCoverage !== undefined) {
    if (!report.pathwayCharts || !report.pathwayCoverage || typeof report.pathwayCoverage.broaderComparisonsPending !== 'boolean') throw new Error('Invalid pathway coverage');
    string(report.pathwayCoverage.note, 'pathway coverage', 300);
  }
  if (report.playerSignupUrl !== undefined) playerSignupLink(report.playerSignupUrl, report.playerId);
  if (report.reviewNotice !== undefined) string(report.reviewNotice, 'review notice', 180);
  if (report.resultsFirst !== undefined && typeof report.resultsFirst !== 'boolean') throw new Error('Invalid results-first presentation');
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

export function validateFocusedMetrics(metrics) {
  for (const metric of metrics) {
    if ((metric.count ?? 0) < 5 && (metric.percentile !== null || metric.average != null)) {
      throw new Error('Focused comparisons require five usable results');
    }
  }
}

export function teamAverageText(metric) {
  const n = metric.count ?? 0;
  if (n < 5) return `Team average unavailable · ${n} usable results (5 needed)`;
  return metric.average ? `Team average: ${metric.average} · ${n} results` : `Team average unavailable · ${n} results`;
}

function makeMetric(metric, focused = false) {
  if (metric.percentile === null) {
    const row = element('div', 'pt-retest');
    const label = element('div', '', metric.label);
    if (metric.note) label.append(element('small', '', metric.note));
    row.append(label, element('strong', '', metric.result || 'Retest'));
    if (!focused) return row;
    const group = element('div', 'pt-missing-result');
    group.append(row, element('p', 'pt-team-average', teamAverageText(metric)));
    return group;
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
  if (focused) row.append(element('p', 'pt-team-average', teamAverageText(metric)));
  return row;
}

function makeVisualMetric(metric, selectable = false) {
  const card = element(selectable ? 'button' : 'article', 'pt-score-card');
  if (selectable) {
    card.type = 'button';
    card.setAttribute('aria-controls', 'pt-score-detail');
  }
  const label = element(selectable ? 'span' : 'h3', selectable ? 'pt-score-label' : '', metric.label);
  const status = metric.status === 'retest' ? 'Retest needed' : 'No result';
  const result = element(selectable ? 'span' : 'p', metric.result ? 'pt-score-value' : 'pt-score-value pt-score-unavailable',
    metric.result || (selectable ? status : 'Retest'));
  card.append(label, result);

  const block = selectable ? 'span' : 'p';
  const comparison = element(selectable ? 'span' : 'div', 'pt-score-comparison');
  if (metric.percentile !== null) {
    const track = element(selectable ? 'span' : 'div', 'pt-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(element('span'), element('span'), element('span'));
    const marker = element('i', 'pt-marker');
    marker.style.left = `${metric.percentile}%`;
    track.append(marker);
    comparison.append(track, element(block, 'pt-score-rank', `≈${ordinal(metric.percentile)} percentile`));
  } else {
    comparison.append(element(block, 'pt-score-rank pt-score-muted', 'No percentile'));
  }
  const count = metric.count ?? 0;
  if (count >= 5 && metric.average) {
    const estimated = selectable && metric.estimatedCount ? ` (${metric.estimatedCount} estimated)` : '';
    comparison.append(element(block, 'pt-score-average', `Team avg ${metric.average} · ${count} results${estimated}`));
  } else {
    const caption = count ? `Team avg unavailable · ${count} results` : 'Team avg unavailable';
    comparison.append(element(block, 'pt-score-average', caption));
  }
  card.append(comparison);
  if (metric.note) card.append(element(block, 'pt-score-note', metric.note));
  if (selectable && metric.status === 'estimate') card.append(element('span', 'pt-score-note', 'Estimate'));
  return card;
}

function makeVisualFindings(report) {
  const section = element('section', 'pt-development pt-score-findings');
  for (const [key, title] of [['strengths', 'Strong today'], ['priorities', 'Practice next']]) {
    const items = report.development[key];
    if (!items.length) continue;
    const block = element('div', 'pt-score-finding');
    block.append(element('h2', '', title));
    const list = element('ul');
    for (const item of items) list.append(element('li', '', item.title));
    block.append(list);
    section.append(block);
  }
  return section;
}

function makeTeamMedian(metric) {
  const section = element('div', 'pt-median');
  const comparison = metric.comparison;
  if (!comparison) {
    const message = metric.result ? 'Team median unavailable for this test.' : 'No qualified result for this test.';
    section.append(element('p', 'pt-score-caption', message));
    return section;
  }

  const { unit, digits, more, less } = STATS_METRICS[metric.key];
  const { value, median, count } = comparison;
  const shownValue = value.toFixed(digits), shownMedian = median.toFixed(digits);
  const delta = Number((Number(shownValue) - Number(shownMedian)).toFixed(digits));
  const gap = delta === 0 ? 'Level with the team median'
    : `${Math.abs(delta).toFixed(digits)} ${unit} ${delta > 0 ? more : less} than the team median`;
  section.append(element('p', 'pt-median-gap', gap));
  const rows = element('dl', 'pt-median-values');
  const max = Math.max(value, median);
  for (const [label, shown, raw, marker] of [
    ['You', shownValue, value, 'you'],
    ['Team median', shownMedian, median, 'team'],
  ]) {
    const row = element('div', 'pt-median-row');
    const readout = element('dd');
    readout.append(element('strong', '', `${shown} ${unit}`));
    const track = element('span', 'pt-median-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span', `pt-median-fill pt-median-${marker}`);
    fill.style.width = `${(100 * raw / max).toFixed(2)}%`;
    track.append(fill);
    readout.append(track);
    row.append(element('dt', '', label), readout);
    rows.append(row);
  }
  section.append(rows, element('p', 'pt-score-caption', `${count} comparable teammates · same session`));
  return section;
}

function makeClubCurve(metric) {
  const section = element('section', 'pt-club-curve');
  section.append(element('h4', '', 'Developmental curve'));
  const curve = metric.curve;
  if (!curve) {
    section.append(element('p', 'pt-score-caption', 'Club comparison unavailable for this test.'));
    return section;
  }
  const { points, own, unit } = curve;
  const firstAge = points[0].age, lastAge = points.at(-1).age;
  const digits = unit === 'm/s' ? 2 : 1;
  const readout = value => `${value.toFixed(digits)} ${unit}`;
  const minAge = Math.min(firstAge, own?.age ?? firstAge) - 0.28;
  const maxAge = Math.max(lastAge, own?.age ?? lastAge) + 0.28;
  const lower = point => Math.max(0, point.mean - point.sd);
  const upper = point => point.mean + point.sd;
  const lowest = Math.min(...points.map(lower), own?.value ?? Infinity);
  const highest = Math.max(...points.map(upper), own?.value ?? 0);
  const span = Math.max(highest - lowest, 0.25);
  const floor = Math.max(0, lowest - span * 0.13), ceiling = highest + span * 0.13;
  const x = age => 42 + (age - minAge) / (maxAge - minAge) * 306;
  const y = value => 122 - (value - floor) / (ceiling - floor) * 104;
  const pair = (age, value) => `${x(age).toFixed(2)},${y(value).toFixed(2)}`;
  const svg = svgElement('svg', { viewBox: '0 0 376 157', role: 'img', 'aria-label':
    `${metric.label}. Club average and spread by age group in ${unit}.${own ? ` Your best: ${readout(own.value)}, U${own.age}.` : ''}` });
  const ySteps = [floor, (floor + ceiling) / 2, ceiling];
  for (const value of ySteps) {
    const cy = y(value);
    svg.append(svgElement('line', { x1: 42, x2: 348, y1: cy, y2: cy, class: 'pt-club-gridline' }),
      svgElement('text', { x: 35, y: cy + 4, 'text-anchor': 'end' }, numberLabel(value)));
  }
  const band = [...points.map(point => pair(point.age, upper(point))),
    ...points.slice().reverse().map(point => pair(point.age, lower(point)))].join(' ');
  svg.append(svgElement('polygon', { points: band, class: 'pt-club-spread' }),
    svgElement('polyline', { points: points.map(point => pair(point.age, point.mean)).join(' '), class: 'pt-club-average' }));
  const ticks = new Set();
  for (let age = Math.ceil(firstAge); age <= lastAge; age++) {
    if (lastAge - firstAge <= 7 || (age - Math.ceil(firstAge)) % 2 === 0) ticks.add(age);
  }
  if (own) ticks.add(own.age);
  for (const age of [...ticks].sort((a, b) => a - b)) {
    svg.append(svgElement('text', { x: x(age), y: 144, 'text-anchor': 'middle' }, `U${age}`));
  }
  if (own) {
    svg.append(svgElement('circle', { cx: x(own.age), cy: y(own.value), r: 5, class: 'pt-club-own' }));
  }
  const legend = element('p', 'pt-club-legend');
  legend.append(element('span', 'pt-legend-average', 'Club average'), element('span', 'pt-legend-spread', 'Spread'));
  if (own) legend.append(element('span', 'pt-legend-own', `Your best · ${readout(own.value)}`));
  const source = curve.through ? `${curve.cohort} · Through ${curve.through}` : curve.cohort;
  section.append(element('p', 'pt-score-caption', `${curve.label} (${unit}) · ${source}`), svg, legend);
  if (own?.average !== undefined) {
    section.append(element('p', 'pt-score-caption', `U${own.age} average · ${readout(own.average)}`));
  } else if (!own) {
    section.append(element('p', 'pt-score-caption', 'Your placement is unavailable for this comparison.'));
  }
  return section;
}

function makeInteractiveScores(metrics, grid) {
  const panel = element('section', 'pt-score-detail');
  panel.id = 'pt-score-detail';
  panel.setAttribute('aria-labelledby', 'pt-score-detail-title');
  const title = element('h3', '', '');
  title.id = 'pt-score-detail-title';
  title.setAttribute('aria-live', 'polite');
  const details = element('div');
  panel.append(title, details);
  const cards = metrics.map(metric => makeVisualMetric(metric, true));
  const select = index => {
    const metric = metrics[index];
    for (const [i, card] of cards.entries()) card.setAttribute('aria-pressed', String(i === index));
    title.textContent = metric.label;
    details.replaceChildren(makeTeamMedian(metric), makeClubCurve(metric));
  };
  for (const [index, card] of cards.entries()) card.addEventListener('click', () => select(index));
  grid.append(...cards);
  select(Math.max(0, metrics.findIndex(metric => metric.result !== null)));
  return panel;
}

function makeStatsFindings(metrics) {
  const measured = metrics.filter(metric => metric.status === 'measured' && metric.percentile !== null);
  const strong = measured.filter(metric => metric.band === 'strong').sort((a, b) => b.percentile - a.percentile)[0];
  const practice = measured.filter(metric => metric.band === 'practice').sort((a, b) => a.percentile - b.percentile)[0];
  const section = element('section', 'pt-development pt-score-findings');
  for (const [title, metric] of [['Strong today', strong], ['Practice next', practice]]) {
    if (!metric) continue;
    const item = element('div', 'pt-score-finding pt-stats-finding');
    item.append(element('h2', '', title), element('p', '', metric.label));
    section.append(item);
  }
  return section;
}

function makeDetails(report) {
  const details = element('details', 'pt-details');
  details.append(element('summary', '', 'How to read this + team averages'));
  const content = element('div', 'pt-detail-content');
  content.append(element('p', '', 'Further right means a more favorable result in this team’s testing session. 50th is the team middle; around 90th is near the top of this session.'));
  content.append(element('p', '', 'Practice: below 25th. Team middle: 25th to below 75th. Strong: 75th and above. Bands use unrounded ranks; the labels are rounded. These are report bands, not age or national standards.'));
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
  for (const chart of report.development?.charts || []) {
    content.append(element('p', '', `${chart.label}: ${chart.reference.label}. Checked ${chart.reference.sourceDate}. ${chart.reference.selectionRule}`));
    for (const note of chart.notes) content.append(element('p', '', note));
  }
  for (const metric of report.metrics) {
    if (metric.note && metric.percentile !== null) content.append(element('p', '', `${metric.label}: ${metric.note}`));
  }
  details.append(content);
  return details;
}

function workoutAnchor(text, href, className = 'pt-recovery-link', onActivate) {
  const link = element('a', className, text);
  link.href = href;
  if (href.startsWith('https://')) link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  if (onActivate) {
    link.addEventListener('click', onActivate);
    link.addEventListener('auxclick', event => { if (event.button === 1) onActivate(); });
  }
  return link;
}

function makeWorkoutEntry(report, record, visual = false) {
  const links = workoutLinks(report.playerId);
  const entry = element('div', 'pt-workout-entry');
  if (!links) {
    entry.append(element('p', 'pt-cta-note', 'Workouts aren’t available from this report.'));
    return entry;
  }
  const platform = workoutPlatform();
  if (report.workoutEntry === 'stats') {
    const stats = `/signin?reportPlayer=${encodeURIComponent(report.playerId)}&reportView=stats`;
    entry.append(
      workoutAnchor('Start a workout', stats, 'pt-primary'),
      element('p', 'pt-cta-note', 'Use your existing PoseTek login to review your Stats, then start a workout.'),
      workoutAnchor('Get PoseTek on iPhone or iPad', links.install, 'pt-install-button', record && (() => record('testflight'))),
    );
    return entry;
  }
  if (report.playerSignupUrl !== undefined) {
    const workout = workoutAnchor(`Open ${report.firstName}’s workouts`, playerSignupLink(report.playerSignupUrl, report.playerId), 'pt-primary', record && (() => record('workouts')));
    // Keep the report open while signup starts. WebKit can cancel the event
    // during same-tab navigation even when the request has keepalive enabled.
    if (visual) {
      workout.textContent = 'Sign up for workouts';
      if (record) workout.target = '_blank';
      const signIn = `/signin?reportPlayer=${encodeURIComponent(report.playerId)}`;
      entry.append(
        workout,
        workoutAnchor('Get PoseTek on iPhone or iPad', links.install, 'pt-install-button', record && (() => record('testflight'))),
        element('p', 'pt-cta-note', 'Create your player login first, then use it in the app.'),
      );
      const recovery = element('div', 'pt-recovery-links');
      recovery.append(workoutAnchor('Sign in', signIn));
      if (platform !== 'android') recovery.append(workoutAnchor('Open PoseTek', links.native));
      entry.append(recovery);
      return entry;
    }
    const guidance = element('p', 'pt-cta-note', `First, create ${report.firstName}’s player login with the filled-in code, or sign in if it’s already set up.${record ? ' Opens in a new tab.' : ''}`);
    if (record) {
      workout.target = '_blank';
      guidance.id = 'pt-workouts-guidance';
      workout.setAttribute('aria-describedby', guidance.id);
    }
    entry.append(workout, guidance);
    const signIn = `/signin?reportPlayer=${encodeURIComponent(report.playerId)}`;
    entry.append(workoutAnchor('Already have the player login? Sign in', signIn));
    if (report.layout === 'focused-v1') {
      const install = element('section', 'pt-install-visible');
      install.append(element('p', 'pt-cta-note', 'New here? Create your player login with Open workouts. Then use the button below to install TestFlight and PoseTek. Sign in to PoseTek with the same email and password, then open Workouts.'));
      install.append(workoutAnchor('Get PoseTek on iPhone', links.install, 'pt-install-button', record && (() => record('testflight'))));
      install.append(element('p', 'pt-platform-label', 'iPhone and iPad'));
      if (platform !== 'android') install.append(workoutAnchor('Already installed? Open PoseTek', links.native));
      entry.append(install);
      return entry;
    }
    if (platform !== 'android') {
      const recovery = element('details', 'pt-app-options');
      recovery.append(element('summary', '', 'Already set up? Open the iPhone or iPad app'));
      const choices = element('div', 'pt-recovery-links');
      choices.append(workoutAnchor('Open in the PoseTek app', links.native));
      recovery.append(choices, makeInstallSteps(links, record));
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

function makeInstallSteps(links, record) {
  const steps = element('div', 'pt-install');
  steps.append(element('p', 'pt-install-title', 'Don’t have PoseTek yet?'));
  const list = element('ol', 'pt-install-list');
  const install = element('li');
  install.append(workoutAnchor('Install or update PoseTek', links.install, undefined, record && (() => record('testflight'))), ' through Apple’s TestFlight.');
  list.append(install, element('li', '', 'Come back to this report and tap Open in the PoseTek app.'));
  steps.append(list);
  return steps;
}

/** Render only an already-decrypted report. Report strings are always plain text. */
export function renderReport(report, record, {visual = ['score-cards-v1', COMPARISON_LAYOUT].includes(report?.visualLayout)} = {}) {
  clearReport();
  const pdf = validate(report);
  const mount = document.getElementById('report-root');
  if (!mount) throw new Error('Missing report mount');
  const focused = report.layout === 'focused-v1';
  visual = visual && report.resultsFirst === true && !report.pathwayCharts;
  const interactive = visual && report.visualLayout === COMPARISON_LAYOUT;
  const phone = element('article', focused ? 'pt-phone pt-focused' : 'pt-phone');
  if (visual) phone.classList.add('pt-visual');
  if (interactive) phone.classList.add('pt-visual-v2');
  const header = element('header', 'pt-top');
  header.append(element('div', 'pt-brand', 'POSETEK'));
  const title = visual ? `${report.firstName}’s test results` : `${report.firstName}’s ${report.pathwayCharts ? 'testing' : 'team'} snapshot`;
  header.append(element('h1', '', title));
  header.append(element('p', '', `${report.name} · ${report.team}`));
  const dateLine = interactive && report.reportKind === 'individual'
    ? `Results through ${report.testDate}`
    : `Coach ${report.coach} · Tested ${report.testDate}`;
  header.append(element('p', '', dateLine));
  if (report.reviewNotice) header.append(element('p', 'pt-coverage', report.reviewNotice));
  if (report.pathwayCoverage) header.append(element('p', 'pt-coverage', report.pathwayCoverage.note));
  const main = element('main', 'pt-body');
  if (!report.resultsFirst) {
    const focus = element('section', 'pt-focus');
    focus.append(element('h2', '', report.focusTitle), element('p', '', report.focusText));
    main.append(focus);
  }

  const actions = element('div', 'pt-actions');
  actions.append(makeWorkoutEntry(report, record, visual));
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
  } else if (visual) {
    const scores = element('section', 'pt-score-section');
    const sectionLabel = interactive && report.reportKind === 'individual' ? 'Test results' : 'Team comparison';
    scores.append(element('h2', '', sectionLabel),
      element('p', 'pt-score-intro', interactive ? 'Tap a test to see how you compare.' : 'Approximate team percentiles. Further right is stronger.'));
    const grid = element('div', 'pt-score-grid');
    scores.append(grid);
    if (interactive) scores.append(makeInteractiveScores(report.metrics, grid));
    else for (const metric of report.metrics) grid.append(makeVisualMetric(metric));
    main.append(scores);
  } else {
  const sectionTitle = element('div', 'pt-section-title');
  const personal = element('span', 'pt-you');
  personal.append(element('span', 'pt-dot'), element('span', '', report.firstName));
  sectionTitle.append(element('h2', '', `Where ${report.firstName} stands`), personal);
  main.append(sectionTitle, element('p', 'pt-provisional', focused ? 'Compared with this team’s testing session. Further right means a stronger result. Percentiles are approximate.' : 'Approximate team percentiles · this testing session'));
  const zones = element('div', 'pt-zones');
  zones.setAttribute('aria-label', 'Team percentile bands');
  for (const zone of ['Practice', 'Team middle', 'Strong']) zones.append(element('span', '', zone));
  if (!focused) main.append(zones);
  for (const metric of report.metrics) main.append(makeMetric(metric, focused));
  }
  const meaning = element('section', 'pt-meaning');
  meaning.setAttribute('aria-label', 'What to work on next');
  for (const summary of report.summary) {
    const row = element('p');
    row.append(element('strong', '', summary.label), element('span', '', summary.text));
    meaning.append(row);
  }
  if (!focused && !visual && report.summary.length) main.append(meaning);
  if (interactive) {
    const findings = makeStatsFindings(report.metrics);
    if (findings.childElementCount) main.append(findings);
  } else if (report.development) main.append(visual ? makeVisualFindings(report) : makeDevelopment(report));
  if (!focused && !visual && !report.pathwayCharts) main.append(makeDetails(report));
  if (report.exercises.length) {
    const practice = element('section');
    practice.append(element('h2', 'pt-practice-title', visual ? 'Two drills to try' :
      report.development ? 'Two drills from your plan' : 'A little practice to get started'));
    for (const exercise of report.exercises) {
      if (visual) {
        const drill = element('details', 'pt-drill pt-score-drill');
        const summary = element('summary');
        summary.append(element('strong', '', exercise.title), element('span', 'pt-dose', exercise.dose));
        drill.append(summary, element('p', '', exercise.instruction));
        if (report.development) {
          drill.append(element('p', 'pt-equipment', `Equipment: ${exercise.equipment}`));
          drill.dataset.drillId = exercise.drillId;
          drill.dataset.workoutId = exercise.workoutId;
        }
        practice.append(drill);
        continue;
      }
      const drill = element('article', 'pt-drill');
      const top = element('div', 'pt-drill-top');
      top.append(element('h3', '', exercise.title), element('span', 'pt-drill-tag', exercise.tag));
      drill.append(top, element('p', 'pt-dose', exercise.dose), element('p', '', exercise.instruction));
      if (report.development) {
        drill.dataset.drillId = exercise.drillId;
        drill.dataset.workoutId = exercise.workoutId;
        drill.append(element('p', 'pt-equipment', `Equipment: ${exercise.equipment}`));
        drill.append(element('p', 'pt-drill-why', `Why this helps you: ${exercise.why}`));
      }
      practice.append(drill);
    }
    practice.append(element('p', 'pt-safety', 'Clear, flat space. Stop if anything hurts.'));
    main.append(practice);
  }
  main.append(actions);
  main.append(element('p', 'pt-private-note', 'Keep this link within your family.'));
  if (record) {
    const actions = report.workoutEntry === 'stats' ? 'its TestFlight button is used' : 'its Workouts and TestFlight buttons are used';
    main.append(element('p', 'pt-private-note', `PoseTek records when this report link is opened, about how long it is viewed, and when ${actions}.`));
  }
  phone.append(header, main);
  pdfUrl = URL.createObjectURL(new Blob([pdf], {type: 'application/pdf'}));
  mount.replaceChildren(phone);
  mount.hidden = false;
  for (const scroll of mount.querySelectorAll('.pt-pathway-scroll[data-prefer-end]')) scroll.scrollLeft = 400;
  const status = document.getElementById('report-status');
  if (status) status.hidden = true;
}
