import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {playerSignInAssets} from './private-player-signin-assets.mjs';
const html = '<!-- posetek-player-signin-entry --><script>window.__posetekPlayerInvitation=null</script><astro-island component-url="/_astro/PlayerSignInRoot.hash.js"></astro-island>';
async function fixture(t, code='import "./shared.hash.js"; const preload=["page.hash.css"];') {
 const root=await mkdtemp(join(tmpdir(),'signup-assets-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'_astro'));await writeFile(join(root,'player-signin.html'),html);
 await writeFile(join(root,'_astro/PlayerSignInRoot.hash.js'),code);
 await writeFile(join(root,'_astro/shared.hash.js'),'export const value=1;');
 await writeFile(join(root,'_astro/page.hash.css'),'body{color:black}');
 await writeFile(join(root,'_astro/AdminPage.unused.js'),'doNotPackage();');return root;
}
test('isolated closure includes actual imports and preload CSS but excludes unrelated generated app assets',async t=>{
 const assets=await playerSignInAssets(await fixture(t));
 assert.deepEqual([...assets.keys()].sort(),['/_astro/PlayerSignInRoot.hash.js','/_astro/page.hash.css','/_astro/shared.hash.js','/player-signin.html']);
});
test('closure rejects external, escaped and application dependencies instead of silently omitting them',async t=>{
 for(const dep of ['https://example.invalid/a.js','../../outside.js','./AdminPage.unused.js']){
 const root=await fixture(t,`import ${JSON.stringify(dep)};`);await assert.rejects(playerSignInAssets(root),/dependency|application routes/);
 }
});
test('closure rejects symlinks and a document without the isolated secret-scrubbing bootstrap',async t=>{
 const root=await fixture(t);await rm(join(root,'_astro/shared.hash.js'));await symlink(join(root,'_astro/page.hash.css'),join(root,'_astro/shared.hash.js'));
 await assert.rejects(playerSignInAssets(root),/symbolic|link/i);
 const other=await fixture(t);await writeFile(join(other,'player-signin.html'),'<astro-island></astro-island>');await assert.rejects(playerSignInAssets(other),/isolation/);
});
