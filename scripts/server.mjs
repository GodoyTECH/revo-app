import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
const base=resolve(process.argv[2]||'.');const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
createServer(async(req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://local').pathname);try{let file=join(base,path);try{await stat(file);}catch{file=join(base,'public',path);}if((await stat(file)).isDirectory())file=join(file,'index.html');res.setHeader('content-type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}}).listen(4173,()=>console.log('Central Diplomática: http://localhost:4173'));
