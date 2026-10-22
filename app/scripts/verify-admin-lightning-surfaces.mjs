// Browser-local acceptance: actual components, synthetic records, no live calls.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { createServer } from 'vite';
import { installFormsFixture } from './admin-lightning-forms-fixture.mjs';
import { installDirectoryFixture } from './admin-lightning-fixture.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(app);
const originOption = process.argv.find(value => value.startsWith('--origin='))?.slice(9);
const origin = originOption || 'http://127.0.0.1:4197';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Use a loopback source preview only.');
const widths = process.argv.includes('--quick') ? [390, 1440] : [360, 390, 430, 768, 1440, 1920];
const output = path.join(repo, 'artifacts/admin-lightning-surfaces/verified');
await mkdir(output, { recursive: true });
let server;
if (!originOption) {
  server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'),
    cacheDir: path.join(app, 'node_modules/.vite-admin-acceptance'),
    server: { host: '127.0.0.1', port: 4197, strictPort: true } });
  await server.listen();
}
const reports = [];
const recordsOnly = process.argv.includes('--records-only');
const check = (name, value, details = {}) => { reports.push({ name, pass: Boolean(value), ...details }); };
try {
  if (!recordsOnly) for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: width < 768 });
        const activate = locator => width < 768 ? locator.tap() : locator.click();
        const prefix = `${engine}-${width}`;
        const fitsPage = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        const nativeSelectsFit = () => page.locator('.admin-workspace__content select:not([multiple]):not([size])').evaluateAll(items => items.filter(item => item.getClientRects().length).every(item => item.getBoundingClientRect().height >= 43.5));
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
        for (const [name, route] of [['device', '/admin/device-performance'], ['teams', '/admin/device-performance/team-sessions'], ['feedback', '/admin/feedback'], ['access', '/admin/access']]) {
          await page.goto(`${origin}${route}?preview=1`);
          await page.locator('.admin-workspace__content').waitFor();
          await page.waitForTimeout(350);
          const result = await page.evaluate(() => ({
            heading: document.querySelector('h1')?.textContent,
            overflow: document.documentElement.scrollWidth > innerWidth,
            smallControls: [...document.querySelectorAll('.admin-workspace__content button')].filter(element => element.getClientRects().length && element.getBoundingClientRect().height < 43.5).map(element => element.textContent),
          }));
          check(`${prefix}-${name}`, !result.overflow && !result.smallControls.length, result);
          await page.screenshot({ path: path.join(output, `${prefix}-${name}.png`), fullPage: true });
        }
        await page.evaluate(async () => { (await import('/scripts/fixtures/admin-lightning/modal.tsx')).mountFixture(); });
        await activate(page.locator('#modal-opener'));
        const modal = page.getByRole('dialog', { name: 'Synthetic review' });
        await modal.waitFor();
        const initial = await modal.evaluate(element => element.open && element.contains(document.activeElement));
        await activate(modal.getByRole('button', { name: 'Rerender 0' }));
        const rerenderFocus = await page.evaluate(() => document.activeElement?.textContent === 'Rerender 1');
        await activate(modal.getByRole('button', { name: 'Simulate saving' }));
        await page.keyboard.press('Escape');
        const busyRetained = await modal.isVisible();
        await activate(modal.getByRole('button', { name: 'Finish saving' }));
        let contained = true;
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
          contained &&= await modal.evaluate(element => element.contains(document.activeElement));
        }
        await page.keyboard.press('Escape');
        const restored = await page.locator('#modal-opener').evaluate(element => element === document.activeElement);
        check(`${prefix}-modal`, initial && rerenderFocus && busyRetained && contained && restored, { initial, rerenderFocus, busyRetained, contained, restored });

        await installFormsFixture(page);
        await page.goto(`${origin}/admin/rep-tools/fixture-player/fixture-jump`);
        await page.getByRole('heading', { name: 'Review form acceptance' }).waitFor();
        check(`${prefix}-review-page-width`, await fitsPage());
        await activate(page.getByRole('button', { name: 'Edit synthetic dose' }));
        const dose = page.getByRole('dialog', { name: 'Dose for Synthetic figure-8 drill' });
        await dose.getByLabel('Sets', { exact: true }).fill('99');
        check(`${prefix}-dose-validation`, await dose.getByRole('button', { name: 'Set the dose' }).isDisabled());
        await dose.getByLabel('Sets', { exact: true }).fill('4');
        await activate(dose.getByRole('button', { name: 'Set the dose' }));
        check(`${prefix}-dose-local-save`, (await page.getByTestId('dose-summary').textContent()) === '4 sets' && await page.locator('#dose-opener').evaluate(element => element === document.activeElement));
        await activate(page.getByRole('button', { name: 'Edit synthetic dose' }));
        await dose.getByLabel('Sets', { exact: true }).fill('2');
        await activate(dose.getByRole('button', { name: 'Cancel', exact: true }));
        check(`${prefix}-dose-cancel`, (await page.getByTestId('dose-summary').textContent()) === '4 sets');

        await activate(page.getByRole('button', { name: 'Review synthetic workout' }));
        const rationale = page.getByRole('dialog', { name: 'Why did you make these adjustments?' });
        check(`${prefix}-rationale-required`, await rationale.getByRole('button', { name: 'Save the workout' }).isDisabled());
        await rationale.getByLabel('Your feedback').fill('Reviewed synthetic evidence.');
        await activate(rationale.getByRole('button', { name: 'Save the workout' }));
        await page.keyboard.press('Escape');
        check(`${prefix}-rationale-busy`, await rationale.isVisible() && await rationale.getByRole('button', { name: 'Keep editing' }).isDisabled());
        await page.evaluate(() => window.fixtureFinishSave());
        await rationale.getByRole('alert').waitFor();
        check(`${prefix}-rationale-failure-retains-draft`, await rationale.getByLabel('Your feedback').inputValue() === 'Reviewed synthetic evidence.');
        await activate(rationale.getByRole('button', { name: 'Keep editing' }));
        check(`${prefix}-rationale-focus`, await page.locator('#rationale-opener').evaluate(element => element === document.activeElement));
        await activate(page.locator('#rationale-opener'));
        await rationale.getByLabel('Your feedback').fill('Synthetic successful review.');
        await activate(rationale.getByRole('button', {name:'Save the workout'}));
        await page.evaluate(()=>window.fixtureFinishSave('success'));
        await page.getByText('Synthetic workout callback completed.',{exact:true}).waitFor();
        check(`${prefix}-rationale-success-callback`, !await rationale.count() && await page.locator('#rationale-opener').evaluate(element=>element===document.activeElement));

        const jumpOpener = page.getByRole('button', { name: 'Review technique correction' });
        check(`${prefix}-jump-unchanged-held`, await jumpOpener.isDisabled());
        await page.getByLabel('Coil technique frame').fill('200');
        await page.getByLabel('Technique correction note').fill('Synthetic frame reviewed against recording.');
        await activate(jumpOpener);
        const jump = page.getByRole('dialog', { name: 'Save jump technique correction' });
        await jump.waitFor();
        await page.screenshot({ path: path.join(output, `${prefix}-jump-review.png`), fullPage: false });
        await activate(jump.getByRole('button', { name: 'Keep reviewing' }));
        check(`${prefix}-jump-cancel-restoration`, await jumpOpener.evaluate(element => element === document.activeElement) && await page.getByLabel('Coil technique frame').inputValue() === '200');
        await activate(jumpOpener);
        await activate(jump.getByRole('button', { name: 'Save technique correction' }));
        await page.keyboard.press('Escape');
        check(`${prefix}-jump-busy`, await jump.isVisible() && await jump.getByRole('button', { name: 'Keep reviewing' }).isDisabled());
        await page.evaluate(() => window.fixtureFinishSave());
        await jump.getByRole('alert').waitFor();
        check(`${prefix}-jump-failure-retains-note`, (await jump.textContent()).includes('Synthetic frame reviewed against recording.'));
        await page.keyboard.press('Escape');
        await activate(jumpOpener);
        await activate(jump.getByRole('button',{name:'Save technique correction'}));
        await page.evaluate(()=>window.fixtureFinishSave('success'));
        await page.getByText('Synthetic technique callback completed: fixture-revision-2',{exact:true}).waitFor();
        check(`${prefix}-jump-success-callback`, !await jump.count() && await page.evaluate(()=>window.fixtureRevision==='fixture-revision-2'));

        await page.goto(`${origin}/admin/drills/new`);
        await page.getByRole('heading', { name: 'Untitled drill' }).waitFor();
        const create = page.getByRole('button', { name: 'Create drill' });
        check(`${prefix}-drill-validation`, await create.isDisabled());
        await page.getByLabel('Name', { exact: true }).fill('Synthetic control drill');
        await page.getByLabel('Step 1', { exact: true }).fill('Keep the ball close.');
        check(`${prefix}-drill-page-width`, await fitsPage());
        check(`${prefix}-drill-native-selects`, await nativeSelectsFit());
        await page.screenshot({ path: path.join(output, `${prefix}-drill-form.png`), fullPage: true });
        await activate(create);
        const cancelDrill = page.getByRole('link', { name: 'Cancel', exact: true });
        const cancelBounds = await cancelDrill.boundingBox();
        if (width < 768) await page.touchscreen.tap(cancelBounds.x + cancelBounds.width / 2, cancelBounds.y + cancelBounds.height / 2);
        else await page.mouse.click(cancelBounds.x + cancelBounds.width / 2, cancelBounds.y + cancelBounds.height / 2);
        check(`${prefix}-drill-save-boundary`, new URL(page.url()).pathname === '/admin/drills/new' && await cancelDrill.getAttribute('aria-disabled') === 'true');
        await page.evaluate(() => window.fixtureFinishSave());
        await page.getByRole('alert').waitFor();
        check(`${prefix}-drill-failure-retains-draft`, await page.getByLabel('Name', { exact: true }).inputValue() === 'Synthetic control drill' && await page.getByLabel('Step 1', { exact: true }).inputValue() === 'Keep the ball close.');
        await activate(cancelDrill);
        await page.getByRole('heading', { name: 'Synthetic drill library destination' }).waitFor();
        check(`${prefix}-drill-cancel`, new URL(page.url()).pathname === '/admin/drills');
        await page.goto(`${origin}/admin/drills/new`);
        await page.getByLabel('Name',{exact:true}).fill('Synthetic saved drill');
        await page.getByLabel('Step 1',{exact:true}).fill('Keep the ball close.');
        await activate(page.getByRole('button',{name:'Create drill',exact:true}));
        await page.evaluate(()=>window.fixtureFinishSave('success'));
        await page.getByRole('button',{name:'Save drill',exact:true}).waitFor();
        check(`${prefix}-drill-success-destination`, new URL(page.url()).pathname==='/admin/drills/DRB-999/edit' && await page.getByLabel('Name',{exact:true}).inputValue()==='Synthetic saved drill');

        await page.goto(`${origin}/admin/programs?orgId=fixture-club&teamId=fixture-team`);
        await page.getByRole('button', { name: 'Alex Morgan (synthetic) player@example.test' }).waitFor();
        await page.getByRole('checkbox', { name: 'Select Alex Morgan (synthetic)', exact: true }).check();
        await page.getByLabel('What would you like to improve?').fill('Synthetic training context.');
        await page.getByRole('checkbox', { name: 'A selected player has pain requiring review' }).check();
        const generation = page.getByRole('button', { name: 'Generate 1 draft', exact: true });
        check(`${prefix}-planner-held-generation`, await generation.isDisabled() && await page.getByText('Automated generation is paused.', { exact: false }).isVisible());
        check(`${prefix}-planner-page-width`, await fitsPage());
        check(`${prefix}-planner-native-selects`, await nativeSelectsFit());
        check(`${prefix}-planner-input-palette`, await page.getByLabel('Find a player', { exact: true }).evaluate(element => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)'));
        await page.screenshot({ path: path.join(output, `${prefix}-planner.png`), fullPage: true });
        await page.getByLabel('Find a player', { exact: true }).fill('No match');
        await page.getByText('No players match this selection.', { exact: true }).waitFor();
        check(`${prefix}-planner-filter-preserves-draft`, await page.getByLabel('What would you like to improve?').inputValue() === 'Synthetic training context.');
        await page.evaluate(() => window.fixtureSetAccount(null));
        await page.getByText('Sign in to open the personalized planner.', { exact: true }).waitFor();
        check(`${prefix}-planner-account-change`, !await page.getByLabel('What would you like to improve?').count());
        await page.goto(`${origin}/admin/programs?orgId=fixture-club&teamId=fixture-team&fixtureDraft=1`);
        const usePlan=page.getByRole('button',{name:'Use this plan for Alex Morgan (synthetic)',exact:true});
        await usePlan.waitFor();
        check(`${prefix}-planner-explicit-review-required`,await usePlan.isDisabled());
        await page.getByRole('checkbox',{name:'I reviewed the evidence, workouts and replacement policy for Alex Morgan (synthetic).',exact:true}).check();
        await activate(usePlan);
        check(`${prefix}-planner-activation-busy`,await usePlan.isDisabled());
        await page.evaluate(()=>window.fixtureFinishSave('success'));
        await page.getByText('Activation submitted. The server will recheck this draft against current player activity.',{exact:false}).waitFor();
        check(`${prefix}-planner-activation-submission`,await page.evaluate(()=>window.fixtureWrites.filter(item=>item.type==='planner'&&item.capability==='activate_personalized_plan'&&item.payload.draftId==='fixture-draft').length===1)&&await usePlan.isDisabled());

        check(`${prefix}-page-errors`, !errors.length, { errors });
        await page.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  if (!recordsOnly) await writeFile(path.join(output, 'report.json'), JSON.stringify({ sourcePreview: origin, widths, checks: reports,
    limitations: ['Synthetic client fixtures do not establish backend acceptance or authorization.', 'No physical devices; narrow widths use browser touch input.', 'External fonts are deliberately unavailable.'] }, null, 2));
  if (server && !recordsOnly) await server.close();
}
if (!recordsOnly) console.log(`${reports.filter(row => row.pass).length}/${reports.length} checks passed. Evidence: ${output}`);
if (reports.some(row => !row.pass)) process.exitCode = 1;


if (recordsOnly) {
 const recordReports=[];
 const scope='/admin/accounts?orgId=northfield&teamId=harbor&directoryLevel=people&reportWeeks=4&reportTimezone=America%2FNew_York';
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();
  try{for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<768});
   const checks=[],errors=[];const activate=locator=>width<768?locator.tap():locator.click();
   const check=(pass,label)=>{checks.push({pass:!!pass,label});if(!pass)throw Error(`${engine}-${width}: ${label}`)};
   const capture=async label=>page.screenshot({path:path.join(output,`${engine}-${width}-record-${label}.png`),fullPage:false});
   const capturePanel=async label=>{await page.locator('.admin-player-panel').evaluate(element=>{const record=document.querySelector('.admin-record-header');const toolbar=document.querySelector('.admin-workspace__toolbar');const offset=innerWidth>=1024&&innerHeight>=800?80+record.getBoundingClientRect().height+24:toolbar.getBoundingClientRect().height+16;scrollTo({top:element.getBoundingClientRect().top+scrollY-offset,behavior:'instant'})});await capture(label+'-panel')};
   page.on('pageerror',error=>errors.push(error.stack||String(error)));
   page.on('requestfailed',request=>{if(new URL(request.url()).hostname==='127.0.0.1')console.log('Record fixture request failure',request.url(),request.failure())});
   try{
    await installDirectoryFixture(page,{record:true});
    await page.goto(origin+scope);
    await page.locator('.directory-player-name').first().waitFor();
    const search=page.getByRole('searchbox',{name:'Find a player in this organization'});
    await search.fill('Alexandria');
    await page.waitForFunction(()=>document.querySelectorAll('.directory-player-name').length===1);
    const row=page.locator('.directory-player-table tbody tr').first();
    await activate(row.locator('summary'));
    const recordLink=row.getByRole('link',{name:/^Profile for /});
    const name=(await recordLink.getAttribute('aria-label')).replace('Profile for ','');
    await activate(recordLink);
    await page.getByRole('heading',{name,exact:true}).waitFor();
    await page.getByRole('heading',{name:'Contact details',exact:true}).waitFor();
    check(await page.getByRole('tab',{name:'Profile',exact:true}).getAttribute('aria-selected')==='true','actual profile tab loads through row action');
    check(await page.getByLabel('Phone number',{exact:true}).inputValue()==='+12025550178','actual populated contact form renders');
    check(await page.locator('.admin-player-panel select').evaluateAll(items=>items.every(item=>item.getBoundingClientRect().height>=43.5)),'profile native selects retain 44px height');
    const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    check(await fits(),'long record identity and profile fit page');
    await page.evaluate(()=>scrollTo(0,0));await capture('profile');await capturePanel('profile');
    const tabs=page.getByRole('tablist',{name:'Player information'});
    await activate(tabs.getByRole('tab',{name:'Results',exact:true}));
    await page.locator('.rep-button').waitFor();
    check(await page.locator('.rep-button').count()===1,'actual results render recorded rep');
    check(await fits(),'recorded results fit page');
    check(await page.locator('.chart-wrap').evaluate(element=>getComputedStyle(element).backgroundColor==='rgb(12, 29, 22)'),'shared chart pale labels retain a dark high-contrast plot');
    check(await page.locator('.admin-drill-tabs .material-symbols-outlined').evaluateAll(items=>items.every(item=>getComputedStyle(item).display==='none')),'redundant result icons remain font-independent');
    await page.evaluate(()=>scrollTo(0,0));await capture('results');await capturePanel('results');
    await activate(page.locator('.rep-button'));
    await page.getByRole('heading',{name:'Synthetic record destination',exact:true}).waitFor();
    check(new URL(page.url()).pathname.endsWith('/results/changeOfDirection/fixture-rep')&&new URL(page.url()).searchParams.get('session')==='Session1','result-to-rep action retains exact rep and session');
    await page.goBack();await page.locator('.rep-button').waitFor();
    await activate(tabs.getByRole('tab',{name:'Workouts',exact:true}));
    await page.getByRole('heading',{name:'Workout activity',exact:true}).waitFor();
    await page.getByText('Synthetic close-control session',{exact:true}).first().waitFor();
    check(await fits(),'actual populated workout history fits page');
    await page.evaluate(()=>scrollTo(0,0));await capture('workouts');await capturePanel('workouts');
    await activate(tabs.getByRole('tab',{name:'AI incidents',exact:true}));
    await page.getByRole('link').filter({hasText:'SYNTHETIC_TIMEOUT'}).waitFor();
    check(await fits(),'actual populated AI incident list fits page');
    await page.evaluate(()=>scrollTo(0,0));await capture('incidents');await capturePanel('incidents');
    await page.goBack();await page.getByText('Synthetic close-control session',{exact:true}).first().waitFor();
    check(await tabs.getByRole('tab',{name:'Workouts',exact:true}).getAttribute('aria-selected')==='true','Back restores actual record tab');
    await page.goForward();await page.getByRole('link').filter({hasText:'SYNTHETIC_TIMEOUT'}).waitFor();
    check(await tabs.getByRole('tab',{name:'AI incidents',exact:true}).getAttribute('aria-selected')==='true','Forward restores actual record tab');
    await page.reload();await page.getByRole('link').filter({hasText:'SYNTHETIC_TIMEOUT'}).waitFor();
    check(await tabs.getByRole('tab',{name:'AI incidents',exact:true}).getAttribute('aria-selected')==='true','reload restores explicit record tab');
    await activate(tabs.getByRole('tab',{name:'Profile',exact:true}));await page.locator('.admin-player-panel select').first().waitFor();
    await page.locator('.admin-player-panel select').first().selectOption('CB');
    await activate(tabs.getByRole('tab',{name:'Results',exact:true}));await page.locator('.rep-button').waitFor();
    await activate(tabs.getByRole('tab',{name:'Profile',exact:true}));await page.locator('.admin-player-panel select').first().waitFor();
    check(await page.locator('.admin-player-panel select').first().inputValue()==='CM','record tab selection never persists unsaved profile fields');
    const planner=page.getByRole('link',{name:'Prescribe workouts',exact:true});
    const plannerHref=await planner.getAttribute('href');
    check(plannerHref.includes('orgId=northfield')&&plannerHref.includes('teamId=harbor')&&plannerHref.includes('returnTo='),'planner handoff retains current ownership and return');
    await activate(page.getByRole('link',{name:'Back to people and organizations',exact:true}));
    await search.waitFor();await page.locator('.directory-player-name').waitFor();
    check(await search.inputValue()==='Alexandria'&&new URL(page.url()).searchParams.get('reportWeeks')==='4'&&new URL(page.url()).searchParams.get('reportTimezone')==='America/New_York','actual record return retains directory search and report filters');
    check(errors.length===0,'no page errors through actual record journeys');
    recordReports.push({engine,width,state:'normal',checks,errors});
   }catch(error){await capture('failure');recordReports.push({engine,width,state:'normal',checks,errors,error:String(error)});throw error}
   finally{await page.close();await writeFile(path.join(output,'records-report.json'),JSON.stringify({checks:recordReports,limitations:['Synthetic read transport; no real accounts or writes.','Rep destination is a URL assertion; actual PlayerDetail and its four panels are exercised.','Browser emulation, not physical devices.']},null,2));}
   for(const state of ['loading','empty','error']){
    const statePage=await browser.newPage({viewport:{width,height:1000},hasTouch:width<768});
    await installDirectoryFixture(statePage,{record:true,recordState:state});
    await statePage.goto(origin+'/admin/accounts/player/fixture-player?orgId=northfield&teamId=harbor');
    const label=state==='loading'?'Loading the athlete…':state==='empty'?'That athlete could not be found.':'Synthetic player record unavailable. Retry this read.';
    await statePage.getByText(label,{exact:true}).waitFor();
    const fit=await statePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    if(!fit)throw Error(`${engine}-${width}: ${state} overflow`);
    await statePage.screenshot({path:path.join(output,`${engine}-${width}-record-${state}.png`),fullPage:false});
    recordReports.push({engine,width,state,checks:[{pass:true,label:'actual loader state visible'},{pass:fit,label:'state fits page'}]});
    await statePage.close();
   }
  }}finally{await browser.close()}
 }
 await writeFile(path.join(output,'records-report.json'),JSON.stringify({checks:recordReports,limitations:['Synthetic read transport; no real accounts or writes.','Rep destination is a URL assertion; actual PlayerDetail and its four panels are exercised.','Browser emulation, not physical devices.']},null,2));
 if(server)await server.close();
 console.log(`${recordReports.flatMap(row=>row.checks).length} player-record checks passed. Evidence: ${output}`);
}
