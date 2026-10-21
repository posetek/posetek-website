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
const home = await moduleFrom('app/src/pages/home/home-logic.ts');
const product = await moduleFrom('app/src/pages/home/product/product-demo.ts');
const coaches = await moduleFrom('app/src/pages/coaches/coach-samples.ts');
const coachPage = await sourceText('app/src/pages/coaches/CoachesPage.tsx');
const clubExcerpt = coachPage.match(/function ClubPreview\(\) \{[\s\S]*?(?=export default function CoachesPage)/)?.[0];
if (!clubExcerpt) throw new Error('Approved ClubPreview source is missing.');
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
function radar(scores, cx, cy, radius, color = c.lime, labels = true) {
  const at = (i, r) => [cx + Math.cos(-Math.PI / 2 + i * Math.PI * .4) * r, cy + Math.sin(-Math.PI / 2 + i * Math.PI * .4) * r];
  const pts = values => values.map((v,i) => at(i,v).map(num).join(',')).join(' ');
  let result = [1,.75,.5,.25].map(scale => `<polygon points="${pts(scores.map(() => radius * scale))}" fill="none" stroke="${c.sage}" stroke-width="1.4" opacity=".5"/>`).join('');
  result += scores.map((_,i) => { const p = at(i,radius); return line(cx,cy,num(p[0]),num(p[1]),c.sage,1,'opacity=".35"'); }).join('');
  result += `<polygon points="${pts(scores.map(s => s / 100 * radius))}" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="4"/>`;
  result += scores.map((score,i) => { const p = at(i,score / 100 * radius); return circle(p[0],p[1],7,color); }).join('');
  if (labels) result += coaches.profileAreas.map((name,i) => { const p=at(i,radius+55); return text(name,num(p[0]),num(p[1]),28,c.paper,'text-anchor="middle"') + text(scores[i],num(p[0]),num(p[1]+35),30,color,'text-anchor="middle"'); }).join('');
  return result;
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
add('players-testing','Recorded movement review','Three enlarged static frames from PoseTek’s approved recorded sprint, arranged as a movement study.','Recorded movement · Existing public sample',[
 {source:'app/src/pages/home/movement/recorded-movement.json',detail:'Sprint frames 18, 36, 48; exact recorded landmark coordinates. Each study uses uniform source-aspect scaling; no generated or interpolated motion.'},
 {source:'app/src/pages/home/pitch/pose-model.ts',detail:'Existing MediaPipe33 skeleton edge topology; face clutter omitted for presentation.'}
],svg('Sprint — recorded movement study',c.dark,
 grid()+text('Every rep.',56,105,88,c.paper)+text('A clearer view.',56,198,88,c.paper)+mono('SPRINT',58,824,28,c.lime)+arrow(1090,76,48,c.lime)+
 `<g transform="translate(570 330) rotate(-8)">${rect(0,0,545,490,'#13392a')}${grid('#9bb38b',.04)}${pose(sprint.frames[48],{x:95,y:65,w:345,h:355},{stroke:6})}</g>`+
 pose(sprint.frames[18],{x:85,y:332,w:290,h:340},{color:'#77937c',stroke:4})+pose(sprint.frames[36],{x:343,y:308,w:300,h:360},{color:'#d1e4b9',stroke:4.5})+
 line(55,752,1140,752,'#648365',1)+[18,36,48].map((f,i)=>mono(`F${String(f).padStart(2,'0')}`,90+i*315,720,24,c.muted)).join('')));
const scores=home.SKILL_ORDER.map(key=>home.SKILL_DATA[key].score);
add('players-profile','Athlete profile','Alex Johnson’s existing sample skill map, with the five illustrative sample scores and an emphasis on agility.','Sample athlete profile',[
 {source:'app/src/pages/home/home-logic.ts',detail:'SKILL_ORDER and SKILL_DATA values81,74,72,70,68; no new performance claim.'},
 {source:'app/src/pages/home/AthleteProfile.tsx',detail:'Approved fictional profile Alex Johnson; radar is redrawn proportionally from the sample score values.'}
],svg('Athlete profile — Alex Johnson sample',c.paper,
 text('Five areas.',64,112,88)+text('One player.',64,205,88)+mark(1060,58,78)+
 `<g transform="translate(55 280) rotate(-4 345 250)">${rect(0,0,700,560,c.ink)}${radar(scores,350,295,190)}</g>`+
 text('68',805,540,220,c.ink)+mono('AGILITY',824,610,30)+line(825,650,1110,650,c.sage,1)+text('Alex Johnson',820,706,34)+text('Midfielder / U17',820,748,25,'#5a6f61')));
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
const team=coaches.sampleTeams[1],player=team.players[0],alex=coaches.sampleTeams[0].players[0];
add('coaches-club','One club, every team','Northfield FC’s existing three illustrative age groups, connected to individual player focus on an editorial pitch diagram.','Illustrative club workspace',[
 {source:'app/src/pages/coaches/CoachesPage.tsx',detail:'Unchanged ClubPreview source excerpt; the pitch is illustrative, not tracked positions. The page layout may change independently.',excerpts:[clubExcerpt]},
 {source:'app/src/pages/coaches/coach-samples.ts',detail:'Existing fictional U13/U15/U17 teams; selected U15 player Jordan Lee,number 6.'}
],svg('One club — every team',c.dark,
 text('One club.',62,122,92,c.paper)+text('Every team.',62,220,92,c.paper)+
 `<g transform="translate(600 105) rotate(8 250 320)">${rect(0,0,518,660,'#183c2a')}${rect(35,35,448,590,'none','stroke="#73936d" stroke-width="2"')}${line(35,330,483,330,'#73936d',2)}${circle(259,330,76,'none','stroke="#73936d" stroke-width="2"')}${rect(165,35,188,108,'none','stroke="#73936d" stroke-width="2"')}${rect(165,517,188,108,'none','stroke="#73936d" stroke-width="2"')}${[[259,180,8],[128,470,6],[390,470,10]].map(([x,y,n])=>circle(x,y,35,'#264c32',`stroke="${c.sage}"`)+text(n,x,y+12,32,c.paper,'text-anchor="middle"')).join('')}${circle(259,330,54,c.lime)}${text(player.number,259,349,58,c.ink,'text-anchor="middle"')}</g>`+
 coaches.sampleTeams.map((t,i)=>rect(59,342+i*137,420,110,i===1?c.lime:'#153829')+text(t.name,89,417+i*137,60,i===1?c.ink:c.paper)+arrow(400,374+i*137,38,i===1?c.ink:c.sage)).join('')+mono('NORTHFIELD FC',62,826,29,c.muted)));
add('coaches-evidence','Individual player evidence','The existing Alex Rivera sample profile and its five illustrative sample scores, presented as a large radar and player-number study.','Illustrative player profile · Scores / 100',[
 {source:'app/src/pages/coaches/coach-samples.ts',detail:'U13 Alex Rivera, Midfielder, number 8, illustrative scores[72,63,68,58,70].'},
 {source:'app/src/pages/coaches/PlayerEvidence.tsx',detail:'Same five-area proportional radar; individual priorities remain fictional sample data.'}
],svg('Alex Rivera — individual player evidence', '#dde5d6',
 text('See the player.',60,120,88)+text('Find the focus.',60,213,88)+
 rect(60,285,535,550,c.ink)+radar(alex.scores,312,572,165,c.lime,true)+
 text('08',642,568,272,c.ink)+line(660,613,1135,613,'#81957c')+text(alex.name,661,686,61)+text('Midfielder / U13',663,744,30,'#4e6854')+mark(1057,760,66)));
add('coaches-development','Plan, train, retest','An editorial sequence connects the existing Figure-8 coaching route with Alex Rivera’s illustrative 7.12 and 6.94 second retest values.','Illustrative development example',[
 {source:'app/src/pages/coaches/coach-samples.ts',detail:'Alex Rivera sample priorDribbleSeconds 7.12, latestDribbleSeconds 6.94, completedSessions 2, plannedSessions 3.'},
 {source:'app/src/pages/coaches/DevelopmentJourney.tsx',detail:'Existing Plan/Train/Retest sequence. No claim of actual player improvement.'},
 {source:'app/src/pages/home/product/DrillDiagram.tsx',detail:'Original arrangement of the existing Figure-8 coaching illustration.'}
],svg('Plan — train — retest',c.paper,
 rect(0,0,W,260,c.lime)+text('Plan. Train. Retest.',58,166,102)+
 `<g transform="translate(58 311)">${rect(0,0,465,510,c.ink)}${mono('TRAIN',33,52,26,c.lime)}${routeEight(0,110,465,300)}${text('2 / 3 sessions',35,466,38,c.paper)}</g>`+
 mono('DRIBBLING / SECONDS',590,351,26)+text(alex.priorDribbleSeconds.toFixed(2),583,494,128,'#72806c')+arrow(922,419,53)+
 text(alex.latestDribbleSeconds.toFixed(2),583,694,169,c.ink)+line(590,755,1135,755,c.sage)+text('Same test. Next step.',590,814,39,c.ink)));
add('coaches-contact','A next step for your club','PoseTek’s approved P mark and existing team-enquiry message in a clean original invitation composition.','PoseTek team enquiry',[
 {source:'app/public/brand/posetek-p.svg',detail:'Approved P badge, unchanged geometry and colors; enlarged, layered only through translation/rotation.'},
 {source:'app/src/pages/coaches/CoachesPage.tsx',detail:'Existing enquiry copy, verified as exact excerpts in baseline and current page. No contact details embedded in artwork.',excerpts:['Your players, your priorities.','Discuss your teams','Arrange testing','Agree ongoing support']}
],svg('Your team — your next step',c.ink,
 rect(42,43,1116,814,'#dbe4cf')+grid('#72886b',.07,100)+
 `<g transform="translate(728 265) rotate(12 210 210)" filter="url(#shadow)">${mark(0,0,440)}</g>`+
 text('Your players.',84,155,89)+text('Your priorities.',84,249,89)+
 text('Let’s start',84,535,84)+text('a conversation.',84,624,84)+
 line(85,714,1080,714,'#7f9378')+mono('POSETEK / FOR CLUBS',86,783,29)+arrow(1030,753,43)));

await mkdir(output,{recursive:true});
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const manifest=[];
for (const art of artworks) {
  const stem=resolve(output,art.id),raw=Buffer.from(art.image);
  await writeFile(stem+'.svg',raw);
  const webp=await sharp(raw).webp({quality:90,effort:6}).toBuffer();
  const small=await sharp(raw).resize(600,450).webp({quality:88,effort:6}).toBuffer();
  await writeFile(stem+'.webp',webp);await writeFile(stem+'-600.webp',small);
  const provenance=await Promise.all(art.provenance.map(async source=>({...source,sha256:hash(await readFile(resolve(root,source.source)))})));
  manifest.push({...Object.fromEntries(Object.entries(art).filter(([key])=>!['image','provenance'].includes(key))),provenance,files:{svg:{path:relative(root,stem+'.svg'),sha256:hash(raw),bytes:raw.length},webp:{path:relative(root,stem+'.webp'),sha256:hash(webp),bytes:webp.length},small:{path:relative(root,stem+'-600.webp'),sha256:hash(small),bytes:small.length}}});
}
const prelude=manifest.map((art,i)=>`import artwork${i} from "./showcase-assets/${art.id}.webp?url";\nimport artwork${i}Small from "./showcase-assets/${art.id}-600.webp?url";`).join('\n');
// String construction avoids runtime filesystem/data parsing in the public bundle.
const entrySource=manifest.map((art,i)=>`  ${JSON.stringify(art.id)}: {\n    title: ${JSON.stringify(art.title)},\n    alt: ${JSON.stringify(art.alt)},\n    qualifier: ${JSON.stringify(art.qualifier)},\n    width: ${W}, height: ${H},\n    src: artwork${i}, srcSmall: artwork${i}Small\n  }`).join(',\n');
await writeFile(resolve(root,'app/src/pages/home/showcase-artwork.ts'),`// Generated from editable SVG compositions by scripts/generate-showcase-artwork.mjs.\n// Artwork is illustrative; visible UI must retain the qualifier beside each preview.\n${prelude}\n\nexport const showcaseArtwork = {\n${entrySource}\n} as const;\n\nexport type ShowcaseArtworkId = keyof typeof showcaseArtwork;\nexport type ShowcaseArtwork = (typeof showcaseArtwork)[ShowcaseArtworkId];\n`);
await writeFile(resolve(output,'provenance.json'),JSON.stringify({version:1,generator:'scripts/generate-showcase-artwork.mjs',rendering:{width:W,height:H,responsiveWidth:600,format:'WebP',sharp:sharp.versions.sharp,svgRenderer:sharp.versions.rsvg,text:'Editable SVG text uses Arial/Helvetica system sans-serif; committed WebP textures carry the reviewed typography without a runtime font dependency.'},sources:'Only checked-in approved public samples and brand assets. No live DOM capture, private data, new measurements, generated motion, or external asset requests.',artworks:manifest},null,2)+'\n');
console.log(JSON.stringify({artworks:manifest.length,largeBytes:manifest.reduce((n,a)=>n+a.files.webp.bytes,0),smallBytes:manifest.reduce((n,a)=>n+a.files.small.bytes,0),output:relative(root,output)}));
