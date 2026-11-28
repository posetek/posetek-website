// Original, editable public-marketing artwork. No live DOM or remote assets.
// Run from any directory: node scripts/generate-showcase-artwork.mjs
import { createHash } from 'node:crypto';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'app/package.json'));
const sharp = require('sharp'); // Existing Astro dependency; no added package.
const output = resolve(root, 'app/src/pages/home/showcase-assets');
const sourceText = path => readFile(resolve(root, path), 'utf8');
const sourceJson = async path => JSON.parse(await sourceText(path));
const moduleFrom = async path => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(await sourceText(path))).toString('base64')}`);
const pathwaySource = 'app/src/pages/home/development-pathway-sample.ts';
const cloudSource = 'app/src/pages/athlete-portal/player/stats/club-cloud.ts';
const { DEFAULT_PATHWAY_ID, samplePathways, samplePathwayStats } = await moduleFrom(pathwaySource);
const { cloudFrom, cloudExtent, valueAxis, stepDigits, cloudLayers, bandPath, linePath } = await moduleFrom(cloudSource);
const product = await moduleFrom('app/src/pages/home/product/product-demo.ts');
const coachSource = 'app/src/pages/coaches/coach-samples.ts';
const coaches = await moduleFrom(coachSource);
const movement = await sourceJson('app/src/pages/home/movement/recorded-movement.json');
const technique = await sourceJson('app/src/pages/home/technique/technique-data.json');
const poseSource = await sourceText('app/src/pages/home/pitch/pose-model.ts');
const edges = JSON.parse(poseSource.match(/export const POSE_EDGES[^=]*=\s*(\[[\s\S]+?\n\]);/)[1].replace(/,\s*\]/g, ']'));
const brand = (await sourceText('app/public/brand/posetek-p.svg')).replace(/^<svg[^>]+>|<\/svg>\s*$/g, '').replace(/<title>[\s\S]*?<\/title>|<desc>[\s\S]*?<\/desc>/g, '');
const photo = 'data:image/jpeg;base64,' + (await readFile(resolve(root, 'app/src/pages/home/product/media/figure-8.jpg'))).toString('base64');
const W = 1200, H = 900;
const c = { ink: '#09271d', dark: '#041b13', lime: '#b7f34a', paper: '#f1f1e9', mist: '#dce4d4', sage: '#91a792', muted: '#b3c8b5', cyan: '#87d8d1' };
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const num = value => Number(value.toFixed(3));
const text = (value, x, y, size = 42, fill = c.ink, extra = '') => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}" letter-spacing="${size > 50 ? '-.055em' : '-.02em'}" ${extra}>${esc(value)}</text>`;
const mono = (value, x, y, size = 22, fill = c.ink, extra = '') => `<text x="${x}" y="${y}" font-family="monospace" font-size="${size}" fill="${fill}" letter-spacing=".045em" ${extra}>${esc(value)}</text>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke = c.sage, width = 1, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${num(x)}" cy="${num(y)}" r="${r}" fill="${fill}" ${extra}/>`;
const mark = (x, y, size) => `<g transform="translate(${x} ${y}) scale(${size / 48})">${brand}</g>`;
const arrow = (x, y, size = 40, color = c.ink) => `<path d="M${x} ${y + size}l${size} -${size}m-${size} 0h${size}v${size}" fill="none" stroke="${color}" stroke-width="3"/>`;
function grid(color = '#abc2ae', opacity = .15, step = 100) {
  return `<g opacity="${opacity}">${Array.from({ length: Math.ceil(W / step) + 1 }, (_, i) => line(i * step, 0, i * step, H, color)).join('')}${Array.from({ length: Math.ceil(H / step) + 1 }, (_, i) => line(0, i * step, W, i * step, color)).join('')}</g>`;
}
function svg(title, background, content, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><title>${esc(title)}</title><defs><filter id="shadow" x="-.3" y="-.3" width="1.6" height="1.6"><feDropShadow dx="0" dy="20" stdDeviation="20" flood-color="#00170c" flood-opacity=".15"/></filter>${defs}</defs>${rect(0, 0, W, H, background)}${content}</svg>\n`;
}
function pose(frame, box, { color = c.lime, opacity = 1, stroke = 6, points = true, aspect = 16 / 9, allFrames = [frame] } = {}) {
  const visible = allFrames.flat().filter(p => p?.length >= 2 && p.slice(0, 2).every(Number.isFinite));
  const xs = visible.map(p => p[0] * aspect), ys = visible.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const project = p => [box.x + box.w / 2 + (p[0] * aspect - (minX + maxX) / 2) * scale, box.y + box.h / 2 + (p[1] - (minY + maxY) / 2) * scale];
  const displayEdges = edges.filter(([a,b]) => a > 10 && b > 10);
  const body = displayEdges.map(([a,b]) => { const p = project(frame[a]), q = project(frame[b]); return line(num(p[0]), num(p[1]), num(q[0]), num(q[1]), color, a > 14 && b > 14 && (a < 23 || b < 23) ? stroke * .55 : stroke, 'stroke-linecap="round"'); }).join('');
  const visibleIndices = [0,7,8,...Array.from({ length: 22 }, (_,i) => i + 11)];
  return `<g opacity="${opacity}">${body}${points ? visibleIndices.map(i => { const p = project(frame[i]); return circle(p[0], p[1], stroke * .68, color); }).join('') : ''}</g>`;
}
function routeEight(x, y, width, height, stroke = c.lime) {
  // Same Gerono geometry and cone centroids as public DrillDiagram.tsx.
  const points = Array.from({ length:129 }, (_,i) => { const a=i / 128 * Math.PI * 2; return [x + width / 2 + width * .42 * Math.sin(a), y + height / 2 + height * .32 * Math.sin(2*a)]; });
  const path = points.map(([a,b],i) => `${i?'L':'M'}${num(a)} ${num(b)}`).join(' ') + 'Z';
  const coneOffset=width * .42 * 3 * Math.PI / 16;
  return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="4" stroke-dasharray="12 9"/>${[-1,1].map(sign => {const a=x+width/2+sign*coneOffset,b=y+height/2;return `<path d="M${num(a)} ${b-16}l15 29h-30z" fill="#edb452"/>`;}).join('')}${circle(x+width/2,y+height/2,15,c.cyan,`stroke="${c.paper}" stroke-width="3"`)}${circle(x+width/2+25,y+height/2+18,7,c.paper)}`;
}
const artworks=[];
function add(id, title, alt, qualifier, provenance, image) {artworks.push({id,title,alt,qualifier,provenance,width:W,height:H,image});}
const sprint=movement.sequences.find(s=>s.key==='sprint');
const topSpeed = sprint.metrics.find(([label]) => label === 'Top speed')[1];
add('players-testing','Soccer testing, rep by rep',`Three frames from a recorded sprint test. This rep reached a top speed of ${topSpeed}.`,'Recorded movement · Public sprint sample',[
 {source:'app/src/pages/home/movement/recorded-movement.json',detail:'Recorded sprint frames 18, 36, 48 and top speed from the same public sequence.'},
 {source:'app/src/pages/home/pitch/pose-model.ts',detail:'Existing MediaPipe33 skeleton edge topology; face clutter omitted for presentation.'}
],svg('Soccer testing — insight from every rep',c.dark,
 grid()+text('Soccer testing.',56,110,88,c.paper)+text('Insight from every rep.',56,207,88,c.paper)+
 `<g transform="translate(570 330) rotate(-8)">${rect(0,0,545,490,'#13392a')}${pose(sprint.frames[48],{x:95,y:65,w:345,h:355},{stroke:6})}</g>`+
 pose(sprint.frames[18],{x:85,y:332,w:290,h:340},{color:'#77937c',stroke:4})+pose(sprint.frames[36],{x:343,y:308,w:300,h:360},{color:'#d1e4b9',stroke:4.5})+
 [[18,90],[36,405],[48,1015]].map(([frame,left])=>mono(`F${String(frame).padStart(2,'0')}`,left,724,24,c.muted)).join('')+
 rect(0,759,W,141,c.dark)+line(55,760,1140,760,'#648365',1)+mono('SPRINT TEST',58,839,34,c.paper)+
 text(`Top speed  ${topSpeed}`,1140,842,49,c.lime,'text-anchor="end"')));

const test = samplePathways[DEFAULT_PATHWAY_ID];
const pathway = samplePathwayStats(DEFAULT_PATHWAY_ID);
const cloud = cloudFrom(pathway.groups);
const axis = valueAxis(...cloudExtent(cloud, 2), 5);
const plot = { left: 138, right: 1072, top: 431, bottom: 743 };
const x = age => plot.left + (age - cloud.from) / (cloud.to - cloud.from) * (plot.right - plot.left);
const y = value => plot.bottom - (value - axis.from) / (axis.to - axis.from) * (plot.bottom - plot.top);
const own = pathway.own;
const ownGroup = pathway.groups.find(group => group.ageGroup === own.ageGroup);
const dotX = x(own.ageGroup), dotY = y(own.best);
const highlight = '#b7f34a', cloudLine = '#f1fff6', cloudFill = '#d6f8e4';
const chartSurface = '#10291f';
function pathwayScore(label, value, left) {
  return text(label, left, 210, 34, '#496352') +
    text(value.toFixed(test.digits), left - 3, 307, 102, c.ink) +
    text(test.unit, left + 219, 302, 44, '#496352');
}
add('players-profile','Your development pathway',
 `Alex’s best left dribble is ${own.best.toFixed(test.digits)} ${test.unit}. The fictional U${own.ageGroup} club average is ${ownGroup.mean.toFixed(test.digits)} ${test.unit}. The curve shows club results across U11 to U17.`,
 'Fictional player and club results',[
 {source:pathwaySource,detail:'The same fictional age groups, means, spreads and individual results as the interactive sample. Both comparison numbers come from the selected test.'},
 {source:cloudSource,detail:'Shared signed-in Player Stats curve, spread and axis functions.'}
],svg('Your development pathway — Alex’s left dribble',c.paper,
 text('Your development pathway',55,109,82)+mark(1066,54,76)+
 line(59,148,1140,148,'#b6c4b5',2)+line(586,179,586,309,'#b6c4b5',2)+
 pathwayScore('Alex’s best left dribble',own.best,62)+pathwayScore(`U${own.ageGroup} club average`,ownGroup.mean,631)+
 rect(0,347,W,553,chartSurface)+text('Left dribble across the club',58,406,40,c.paper)+
 text(`Course speed (${test.unit})`,1136,403,29,c.muted,'text-anchor="end"')+
 axis.ticks.map(value => line(plot.left,y(value),plot.right,y(value),'#496352',1.4)+
   text(value.toFixed(stepDigits(axis.step)),113,y(value)+9,28,c.muted,'text-anchor="end"')).join('')+
 cloudLayers(32,.42).map(({k,opacity}) => `<path d="${bandPath(cloud,k,x,y)}" fill="${cloudFill}" opacity="${opacity}"/>`).join('')+
 `<path d="${linePath(cloud,x,y)}" fill="none" stroke="${cloudLine}" stroke-width="5"/>`+
 line(dotX,dotY,dotX,plot.bottom,highlight,2,'stroke-dasharray="5 8" opacity=".66"')+
 own.results.filter(value=>value!==own.best).map(value=>circle(dotX,y(value),5,chartSurface,`stroke="${highlight}" stroke-width="2"`)).join('')+
 circle(dotX,dotY,18,highlight,'opacity=".24"')+circle(dotX,dotY,9,highlight,`stroke="${c.dark}" stroke-width="2"`)+
 line(dotX-48,dotY-52,dotX-8,dotY-8,highlight,2.5)+rect(dotX-146,dotY-94,108,49,highlight,'rx="24"')+
 text('Alex',dotX-92,dotY-60,32,c.dark,'text-anchor="middle"')+
 pathway.groups.map(({ageGroup})=>text(`U${ageGroup}`,x(ageGroup),787,32,ageGroup===own.ageGroup?highlight:c.paper,'text-anchor="middle"')).join('')+
 line(59,818,1140,818,'#506a5b',1.5)+line(62,862,108,862,cloudLine,4.5)+text('Club average',125,873,32,c.paper)+
 rect(479,850,49,23,'#768d7f','rx="6"')+text('Spread within each age group',548,873,32,c.paper)));
const workout=product.createDemoWorkout({minutes:15,energy:'normal',focus:'dribbling'}),drill=workout.drills[0];
add('players-training','Training that follows the evidence','An original training composition pairing the approved Figure-8 dribble poster with its existing two-cone route.','Sample workout · Coaching illustration',[
 {source:'app/src/pages/home/product/product-demo.ts',detail:'createDemoWorkout({minutes:15,energy:"normal",focus:"dribbling"}); Figure-8 dribble,3sets×60seconds,45seconds rest.'},
 {source:'app/src/pages/home/product/DrillDiagram.tsx',detail:'Original editorial rendering of the existing Gerono figure-eight route and two-cone centroids.'},
 {source:'app/src/pages/home/product/media/figure-8.jpg',detail:'Approved public DRB-006 poster, proportionally placed, not a private recording.'}
],svg('Own your next touch — sample training', '#c9dbb7',
 rect(0,0,510,900,c.dark)+`<image href="${photo}" x="36" y="50" width="438" height="778" preserveAspectRatio="xMidYMid meet"/>`+
 rect(540,62,600,772,'#e9eddf')+text('Own your',580,158,74)+text('next touch.',580,237,74)+mono('FIGURE-8 DRIBBLE',583,300,26)+
 `<g transform="translate(570 365)">${rect(0,0,540,300,c.ink,'rx="3"')}${routeEight(0,0,540,300)}</g>`+
 text(`${drill.sets} × ${drill.workSeconds}s`,580,771,65)+text(`${drill.restSeconds}s rest`,895,768,36,'#455b45')+line(580,703,1100,703,c.sage)));
const metric=product.sampleAthlete.metrics[0];
const chartPoints=metric.values.map((v,i)=>[130+i*215,395+(6.62-v)/.44*185]);
add('players-coach','AI Coach and retesting','The existing four-assessment sample dribbling trend, from 6.62 to 6.18 seconds, paired with the sample coaching question.','Sample AI Coach conversation',[
 {source:'app/src/pages/home/product/product-demo.ts',detail:'sampleAthlete dribbling values[6.62,6.43,6.31,6.18] and coachQuestions progress question; no live AI result.'},
 {source:'app/src/pages/home/product/CoachMetricChart.tsx',detail:'Four observations shown in order with their source values; decreasing times are drawn downward.'}
],svg('AI Coach — four sample assessments',c.paper,
 text('How am I',60,123,90)+text('progressing?',60,216,90)+mark(1057,56,78)+
 rect(59,294,1081,380,c.ink)+[370,470,570].map(y=>line(98,y,1095,y,'#748d6f',1,'opacity=".25"')).join('')+
 `<polyline points="${chartPoints.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${c.lime}" stroke-width="5"/>`+
 chartPoints.map(([x,y],i)=>circle(x,y,i===3?12:7,c.lime)+text(metric.values[i].toFixed(2),x,y-30,34,c.paper,'text-anchor="middle"')).join('')+
 text('6.18',850,563,86,c.lime)+mono('SECONDS',876,610,22,c.paper)+
 text('Compare the same setup.',61,760,50)+text('Build on the evidence.',61,818,50,'#5a6f61')+arrow(1066,749,55)));
const contact=technique.phases.find(p=>p.key==='contact'),back=technique.phases.find(p=>p.key==='backswing');
add('players-technique','Technique at the same moment','Two saved phases from the approved recorded kick: backswing and contact, with the original contact knee measurement.','Recorded technique · Saved phase measurement',[
 {source:'app/src/pages/home/technique/technique-data.json',detail:`Saved recorded backswing index ${back.index}/source frame ${back.sourceFrame} and contact index ${contact.index}/source frame ${contact.sourceFrame}; contact kicking-knee value ${contact.metrics[0].value}°. No professional follow-through is invented.`},
 {source:'app/src/pages/home/pitch/pose-model.ts',detail:'Existing skeleton topology; uniformly fitted to individual editorial panels with 16:9 source-aspect correction.'}
],svg('Technique — saved contact phase', '#1d382b',
 text('One kick.',57,113,88,c.paper)+text('One clear cue.',57,207,88,c.paper)+
 rect(58,280,458,530,'#304e38')+rect(539,280,602,530,'#cee0ad')+
 pose(technique.frames[back.index],{x:105,y:335,w:355,h:360},{color:'#c5d4b0',stroke:5})+
 pose(technique.frames[contact.index],{x:580,y:327,w:510,h:375},{color:c.ink,stroke:7})+
 mono('BACKSWING',88,773,24,c.paper)+mono('CONTACT',575,772,24,c.ink)+text(`${contact.metrics[0].value.toFixed(1)}°`,932,770,49,c.ink,'text-anchor="end"')+text('Knee',1083,770,29,c.ink,'text-anchor="end"')));
add('players-mobile','Your next session in your pocket','A bespoke PoseTek phone illustration featuring the existing Figure-8 drill route and its three sample sets.','Illustrative mobile workout preview',[
 {source:'app/src/pages/home/MobileAppPreview.tsx',detail:'PoseTek mobile workout shell and Figure-8 dribble first-set state; original static illustration, not an app screenshot.'},
 {source:'app/src/pages/home/product/product-demo.ts',detail:'Same 15-minute sample workout; Figure-8 drill, 3 sets of60seconds.'},
 {source:'app/src/pages/home/product/DrillDiagram.tsx',detail:'Existing two-cone Gerono figure-eight route.'},
 {source:'app/public/brand/posetek-p.svg',detail:'Unmodified approved P badge inside the editorial phone.'}
],svg('Your next session — mobile preview', '#d9e2d1',
 text('Take the',61,125,89)+text('next step.',61,220,89)+text('With you.',61,315,89,'#57705c')+
 `<g transform="translate(617 44) rotate(7 235 400)" filter="url(#shadow)">${rect(0,0,480,822,'#536a58','rx="63"')}${rect(9,9,462,804,c.dark,'rx="55"')}${rect(156,25,168,32,'#000c08','rx="16"')}${mark(39,86,55)}${text('PoseTek',110,124,34,c.paper)}${text('Figure-8',37,218,59,c.paper)}${text('dribble',37,282,59,c.paper)}${rect(30,332,420,290,'#14382a','rx="16"')}${routeEight(34,343,410,266)}${mono('SET 1 OF 3',38,677,25,c.lime)}${[0,1,2].map(i=>circle(64+i*74,731,24,i===0?c.lime:'none',`stroke="${c.lime}" stroke-width="2"`)+text(i+1,64+i*74,741,28,i===0?c.ink:c.paper,'text-anchor="middle"')).join('')}${rect(164,783,152,5,'#bdc9b8','rx="3"')}</g>`+
 `<g transform="translate(57 514)">${circle(145,145,145,'none',`stroke="${c.sage}" stroke-width="1"`)}${circle(145,145,104,'none',`stroke="${c.sage}" stroke-width="1"`)}${arrow(101,99,88)}</g>`));
const team = coaches.sampleTeams[0];
const checkIn = coaches.getTeamCheckIn(team);
const firstName = checkIn.name.split(' ')[0];
const selectedTest = coaches.reportTests.find(test => test.id === 'dribbleLeft');
const teamReport = coaches.getTeamTestReport(team, selectedTest.id);
const ageGroups = coaches.getClubTestPathway(selectedTest.id);
const reportValue = value => `${value.toFixed(selectedTest.digits)} ${selectedTest.unit}`;
const report = { surface: '#0c1c14', text: '#f0f6eb', muted: '#b3c8b7', bar: '#bedf83', team: '#a6daf5', rule: '#3b5443' };
const end = 'text-anchor="end"', middle = 'text-anchor="middle"';
const plotBase = 703, plotHeight = 355;
const maxTime = Math.ceil(Math.max(teamReport.average, ...ageGroups.map(group => group.mean)) / 2) * 2;
const chartY = seconds => plotBase - plotHeight * seconds / maxTime;
const teamY = chartY(teamReport.average);
const groupBars = ageGroups.map((group, index) => {
  const center = 318 + 304 * index;
  return rect(center - 74, chartY(group.mean), 148, plotBase - chartY(group.mean), report.bar, 'rx="5"') +
    text(group.mean.toFixed(selectedTest.digits), center, 646, 43, report.surface, middle) +
    text(group.ageGroup, center, 756, 42, report.text, middle) +
    text(`${group.testedPlayers} tested`, center, 795, 29, report.muted, middle);
}).join('');
add('coaches-club','The team development pathway',
 `Left dribble. The fictional ${team.name} team averaged ${reportValue(teamReport.average)}. Club age-group averages: ${ageGroups.map(group => group.ageGroup + ' ' + reportValue(group.mean)).join(', ')}.`,
 'Fictional club and team results', [
  {source:coachSource,detail:'The selected team mean, club age-group means and tested counts come from the same dated left-dribble report as the interactive sample.'}
],svg('Where does the team stand? — Northfield FC development pathway', report.surface,
 mono(`NORTHFIELD FC  /  ${team.name}`,61,78,30,report.bar)+text(coaches.coachSessionDate,1139,78,32,report.muted,end)+
 text(`Where does ${team.name} stand?`,56,188,91,report.text)+
 line(61,233,1139,233,report.rule,2)+text('Left dribble',59,301,52,report.text)+text('Time in seconds · Lower is faster',1139,298,31,report.muted,end)+
 [0, .25, .5, .75, 1].map(fraction => line(142,chartY(maxTime*fraction),1137,chartY(maxTime*fraction),report.rule,2) +
   text(maxTime*fraction,111,chartY(maxTime*fraction)+9,29,report.muted,end)).join('')+
 groupBars+line(142,teamY,1137,teamY,report.surface,9)+line(142,teamY,1137,teamY,report.team,5,'stroke-dasharray="16 10"')+
 rect(57,848,28,21,report.bar,'rx="2"')+text('Club age-group average',100,870,32,report.text)+
 line(652,859,710,859,report.team,5,'stroke-dasharray="12 7"')+text(`${team.name} team · ${reportValue(teamReport.average)}`,728,870,32,report.text)));

const checkInField = `${team.name} · ${checkIn.position}`;
const focusWords = checkIn.focus.split(' ');
const focusBreak = focusWords.findIndex((_, i) => focusWords.slice(0, i + 1).join(' ').length > 29);
const focusLines = focusBreak === -1 ? [checkIn.focus] : [focusWords.slice(0,focusBreak).join(' '), focusWords.slice(focusBreak).join(' ')];
add('coaches-evidence', 'A player check-in',
 `${checkIn.name}’s left-dribble result was ${reportValue(checkIn.latestDribbleSeconds)}, against the ${team.name} team average of ${reportValue(teamReport.average)}. Practice focus: ${checkIn.focus}`,
 'Fictional player and team comparison', [
  {source:coachSource,detail:'The report’s default player check-in, measured result, team comparison and practice focus are read from the fictional team report.'}
],svg(`Player check-in — ${checkIn.name}`,c.paper,
 mono('PLAYER CHECK-IN',60,80,30,'#4e685b')+text(checkInField,1139,82,34,'#4e685b',end)+
 text(checkIn.name,52,238,137,c.ink)+line(60,289,1140,289,'#b4c4b3',2)+
 text('Left dribble',60,354,43,c.ink)+text(coaches.coachSessionDate,1138,352,32,'#4e685b',end)+
 text(`${firstName}’s time`,60,425,35,'#4e685b')+text('Team average',642,425,35,'#4e685b')+
 text(reportValue(checkIn.latestDribbleSeconds),54,542,111,c.ink)+line(586,389,586,551,'#b4c4b3',2)+text(reportValue(teamReport.average),636,542,111,c.ink)+
 rect(0,609,W,291,report.surface)+mono('PRACTICE FOCUS',60,672,28,report.bar)+
 focusLines.map((value,i)=>text(value,56,768+i*72,69,report.text)).join('')));

const checkInDrill = workout.drills.find(item => item.id === checkIn.drillId);
if (checkInDrill?.id !== 'DRB-006') throw new Error('The check-in workout must match the approved Figure-8 photo.');
add('coaches-development','Follow the work between tests',
 `${checkIn.name}’s sample Figure-8 dribble workout, ${checkIn.workoutMinutes} minutes logged and ${checkIn.completedSessions} of ${checkIn.plannedSessions} sessions completed. Left-dribble results: ${reportValue(checkIn.priorDribbleSeconds)} earlier, ${reportValue(checkIn.latestDribbleSeconds)} latest.`,
 'Fictional workout and retest', [
  {source:coachSource,detail:'Uses the selected check-in player’s prescribed drill, recorded activity window, logged sessions and earlier/latest retest from the fictional follow-up.'},
  {source:'app/src/pages/home/product/product-demo.ts',detail:'The drill name comes from the public workout catalog and is matched to the selected player’s drill ID.'},
  {source:'app/src/pages/home/product/media/figure-8.jpg',detail:'Approved public Figure-8 demonstration still. The image illustrates the assigned drill.'}
],svg(`Training follow-up — ${checkIn.name}`,'#dce5d4',
 text('Training follow-up',56,138,99,c.ink)+
 text(checkIn.name,61,205,43,'#405a49')+text(coaches.coachActivityWindow,1140,202,34,'#405a49',end)+
 `<image href="${photo}" x="60" y="249" width="476" height="477" preserveAspectRatio="xMidYMin slice" clip-path="url(#drill-image)"/>`+
 rect(60,725,476,116,report.surface)+text(checkInDrill.name,86,800,48,report.text)+
 text('Workout time',597,301,36,'#405a49')+text(`${checkIn.workoutMinutes} min`,593,400,97,c.ink)+
 line(598,438,1140,438,'#aabda9',2)+text('Sessions logged',597,503,36,'#405a49')+
 text(`${checkIn.completedSessions} of ${checkIn.plannedSessions}`,593,602,97,c.ink)+line(598,642,1140,642,'#aabda9',2)+
 text('Left dribble · Earlier to latest',597,705,34,'#405a49')+
 text(`${checkIn.priorDribbleSeconds.toFixed(2)} → ${reportValue(checkIn.latestDribbleSeconds)}`,592,801,65,c.ink),
 '<clipPath id="drill-image"><rect x="60" y="249" width="476" height="477"/></clipPath>'));

const stations = [
  {key:'sprint', label:'Sprint', frame:12},
  {key:'dribbling', label:'Dribbling', frame:112},
  {key:'broadJump', label:'Broad jump', frame:23}
];
const stationArt = stations.map(({key,label,frame},index) => {
  const seq = movement.sequences.find(item => item.key === key), left = 61+index*375;
  return (index ? line(left-26,469,left-26,818,report.rule,2) : '') +
    pose(seq.frames[frame],{x:left+54,y:478,w:216,h:239},{stroke:5,color:report.bar})+
    text(label,left+163,794,42,report.text,middle);
}).join('');
add('coaches-contact','Plan a club testing day',
 'A club testing-day invitation showing three examples from PoseTek’s test battery: sprint, dribbling and broad jump.',
 'Recorded movement · Testing-day examples', [
  {source:'app/src/pages/home/movement/recorded-movement.json',detail:'Sprint frame 12, dribbling frame 112 and broad jump frame 23 from recorded public demonstration sequences.'},
  {source:'app/src/pages/home/pitch/pose-model.ts',detail:'Original skeleton edge topology for all three recorded tests.'},
  {source:'app/public/brand/posetek-p.svg',detail:'Approved P mark in the testing invitation.'}
],svg('Bring testing to your club', '#cbe8a2',
 text('Bring testing',49,150,122,c.ink)+text('to your club.',49,283,122,c.ink)+mark(1036,57,103)+
 rect(0,365,W,535,report.surface)+text('On-field tests',57,432,40,report.muted)+
 stationArt));
await mkdir(output,{recursive:true});
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const requested = new Set(process.argv.slice(2));
for (const id of requested) {
  if (!artworks.some(art => art.id === id)) throw new Error(`Unknown artwork: ${id}`);
}
const prior = requested.size ? JSON.parse(await readFile(resolve(output,'provenance.json'),'utf8')).artworks : [];
const manifest=[];
for (const art of artworks) {
  if (requested.size && !requested.has(art.id)) {
    const saved = prior.find(entry => entry.id === art.id);
    if (!saved) throw new Error(`Missing existing artwork: ${art.id}. Run a full generation.`);
    manifest.push(saved);
    continue;
  }
  const stem=resolve(output,art.id),raw=Buffer.from(art.image);
  await writeFile(stem+'.svg',raw);
  const webp=await sharp(raw).webp({quality:90,effort:6}).toBuffer();
  const small=await sharp(raw).resize(600,450).webp({quality:88,effort:6}).toBuffer();
  await writeFile(stem+'.webp',webp);await writeFile(stem+'-600.webp',small);
  const provenance=await Promise.all(art.provenance.map(async source=>({...source,sha256:hash(await readFile(resolve(root,source.source)))})));
  manifest.push({...Object.fromEntries(Object.entries(art).filter(([key])=>!['image','provenance'].includes(key))),provenance,files:{svg:{path:relative(root,stem+'.svg'),sha256:hash(raw),bytes:raw.length},webp:{path:relative(root,stem+'.webp'),sha256:hash(webp),bytes:webp.length},small:{path:relative(root,stem+'-600.webp'),sha256:hash(small),bytes:small.length}}});
}
const activeArtwork = manifest.filter(art => art.id !== 'players-technique');
const prelude=activeArtwork.map((art,i)=>`import artwork${i} from "./showcase-assets/${art.id}.webp?url";\nimport artwork${i}Small from "./showcase-assets/${art.id}-600.webp?url";`).join('\n');
// String construction avoids runtime filesystem/data parsing in the public bundle.
const entrySource=activeArtwork.map((art,i)=>`  ${JSON.stringify(art.id)}: {\n    title: ${JSON.stringify(art.title)},\n    alt: ${JSON.stringify(art.alt)},\n    qualifier: ${JSON.stringify(art.qualifier)},\n    width: ${W}, height: ${H},\n    src: artwork${i}, srcSmall: artwork${i}Small\n  }`).join(',\n');
await writeFile(resolve(root,'app/src/pages/home/showcase-artwork.ts'),`// Generated from editable SVG compositions by scripts/generate-showcase-artwork.mjs.\n// Artwork is illustrative; visible UI must retain the qualifier beside each preview.\n${prelude}\n\nexport const showcaseArtwork = {\n${entrySource}\n} as const;\n\nexport type ShowcaseArtworkId = keyof typeof showcaseArtwork;\nexport type ShowcaseArtwork = (typeof showcaseArtwork)[ShowcaseArtworkId];\n`);
await writeFile(resolve(output,'provenance.json'),JSON.stringify({version:1,generator:'scripts/generate-showcase-artwork.mjs',rendering:{width:W,height:H,responsiveWidth:600,format:'WebP',sharp:sharp.versions.sharp,svgRenderer:sharp.versions.rsvg,text:'Editable SVG text uses Arial/Helvetica system sans-serif; committed WebP textures carry the reviewed typography without a runtime font dependency.'},sources:'Only checked-in approved public samples and brand assets. No live DOM capture, private data, new measurements, generated motion, or external asset requests.',artworks:manifest},null,2)+'\n');
console.log(JSON.stringify({artworks:manifest.length,largeBytes:manifest.reduce((n,a)=>n+a.files.webp.bytes,0),smallBytes:manifest.reduce((n,a)=>n+a.files.small.bytes,0),output:relative(root,output)}));
