import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
await Promise.all(['index.html','logo.png','public','src'].map((path)=>cp(path,`dist/${path==='public'?'':path}`,{recursive:true})));
console.log('Build concluído em dist/');
