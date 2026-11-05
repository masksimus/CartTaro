// Loopback-only static fixture reproducing hosts that redirect index.html to /.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../v6/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff':'font/woff','.txt':'text/plain'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'||!url.pathname.startsWith('/v6/')){res.writeHead(404);return res.end();}
    if(url.pathname==='/v6/index.html'){res.writeHead(307,{Location:'/v6/'+url.search});return res.end();}
    const path=resolve(root,decodeURIComponent(url.pathname.slice(4))||'index.html');
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)||!types[extname(path)]){res.writeHead(404);return res.end();}
    const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)],'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(8766,'127.0.0.1');
