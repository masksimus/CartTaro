// A portable anonymous-only HTML for unreliable networks. No remote loader,
// credentials, service worker, account or reward API; open the file directly.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../v6/',import.meta.url);
const mime={svg:'image/svg+xml',woff:'font/woff'};
const dataURI=async path=>'data:'+mime[path.split('.').pop()]+';base64,'+(await readFile(new URL(path,root))).toString('base64');
let html=await readFile(new URL('demo.html',root),'utf8');
let css=await readFile(new URL('style.css',root),'utf8');
for(const match of [...css.matchAll(/url\('\.\/([^']+)'\)/g)])css=css.replace(match[0],`url('${await dataURI(match[1])}')`);
for(const match of [...html.matchAll(/src="\.\/(assets\/[^" ]+)"/g)])html=html.replace(match[0],`src="${await dataURI(match[1])}"`);
const content=(await readFile(new URL('content.mjs',root),'utf8')).replace(/^export /gm,'');
const game=(await readFile(new URL('game.mjs',root),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
let app=(await readFile(new URL('app.js',root),'utf8')).replace(/^import .*;\n/gm,'');
const cards=await Promise.all(Array.from({length:22},(_,i)=>dataURI(`assets/cards/${i}.svg`)));
app=app.replace("img.src=back?'./assets/back.svg':`./assets/cards/${id}.svg`",`img.src=back?${JSON.stringify(await dataURI('assets/back.svg'))}:embeddedCards[id]`);
app=app.replace("seal.src='./assets/seal.svg'",`seal.src=${JSON.stringify(await dataURI('assets/seal.svg'))}`);
const licenses=(await readFile(new URL('LICENSES.txt',root),'utf8'))+'\n\n'+(await readFile(new URL('assets/FONT-LICENSE.txt',root),'utf8'))+'\n\n'+(await readFile(new URL('vendor/VK-BRIDGE-LICENSE.txt',root),'utf8'));
app=app.replace("licenses.href='./LICENSES.txt'",`licenses.href='data:text/plain;charset=utf-8;base64,${Buffer.from(licenses).toString('base64')}';licenses.download='Arcana-LICENSES.txt'`);
app=app.replace("async function cacheDemo(){",'async function cacheDemo(){return;');
const startup=await readFile(new URL('startup.js',root),'utf8');
const script='(()=>{\nconst embeddedCards='+JSON.stringify(cards)+';\n'+content+'\n'+game+'\n'+app+'\n})();';
const digest=text=>"'sha256-"+createHash('sha256').update(text).digest('base64')+"'";
const csp=`default-src 'none'; script-src ${digest(startup)} ${digest(script)}; style-src ${digest(css)}; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`;
html=html.replace(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/,`<meta http-equiv="Content-Security-Policy" content="${csp}">`)
 .replace(/  <script src="\.\/vendor\/[^\n]+\n/,'')
 .replace('<script src="./startup.js"></script>',`<script>${startup}</script>`)
 .replace('<link rel="stylesheet" href="./style.css">',`<style>${css}</style>`)
 .replace('  <script type="module" src="./app.js"></script>\n','')
 .replace('</body>',`<script>${script}</script>\n</body>`);
await writeFile(new URL('dist/arcana-offline.html',root),html);
await writeFile(new URL('offline.html',root),html);
console.log('Standalone local-only HTML: '+Buffer.byteLength(html)+' bytes, no network required.');
