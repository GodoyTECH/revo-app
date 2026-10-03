import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'logo.png');
const icons = resolve(root, 'public/icons');
await access(source).catch(() => { throw new Error('logo.png não foi encontrada na raiz.'); });
await mkdir(icons, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const name = Buffer.from(type); const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8); return out; };

function decodePng(buffer) {
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20), idat = []; let offset = 8;
  while (offset < buffer.length) { const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8); if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length)); offset += length + 12; }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, pixels = Buffer.alloc(width * height * 4); let previous = Buffer.alloc(stride), pos = 0;
  const paeth = (a,b,c) => { const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c); return pa<=pb&&pa<=pc?a:pb<=pc?b:c; };
  for (let y=0;y<height;y++) { const filter=raw[pos++], row=Buffer.alloc(stride); for(let x=0;x<stride;x++){ const value=raw[pos++], a=x>=4?row[x-4]:0,b=previous[x],c=x>=4?previous[x-4]:0; row[x]=(value+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255; } row.copy(pixels,y*stride); previous=row; }
  return { width, height, pixels };
}

function encodePng(width, height, pixels) {
  const raw=Buffer.alloc((width*4+1)*height); for(let y=0;y<height;y++){ raw[y*(width*4+1)]=0; pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4); }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height,4); ihdr.set([8,6,0,0,0],8);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

function resize(image, size, padding = 0) { const pixels=Buffer.alloc(size*size*4), usable=size-padding*2; for(let y=0;y<usable;y++)for(let x=0;x<usable;x++){ const sx=Math.min(image.width-1,Math.floor(x*image.width/usable)), sy=Math.min(image.height-1,Math.floor(y*image.height/usable)), src=(sy*image.width+sx)*4,dst=((y+padding)*size+x+padding)*4; image.pixels.copy(pixels,dst,src,src+4); } return encodePng(size,size,pixels); }

const original=await readFile(source), image=decodePng(original);
const outputs=[['favicon-16x16.png',16,0],['favicon-32x32.png',32,0],['favicon.png',48,0],['apple-touch-icon.png',180,10],['icon-192.png',192,0],['icon-512.png',512,0],['maskable-icon-192.png',192,20],['maskable-icon-512.png',512,54]];
const generated=new Map(outputs.map(([name,size,pad])=>[name,resize(image,size,pad)]));
await Promise.all([...generated].map(([name,data])=>writeFile(resolve(icons,name),data)));
await writeFile(resolve(root, 'public/logo-web.png'), resize(image, 512));
const png32=generated.get('favicon-32x32.png'), icoHeader=Buffer.from([0,0,1,0,1,0,32,32,0,0,1,0,32,0,...Buffer.alloc(8)]); icoHeader.writeUInt32LE(png32.length,14); icoHeader.writeUInt32LE(22,18); await writeFile(resolve(icons,'favicon.ico'),Buffer.concat([icoHeader,png32]));
console.log(`Ícones redimensionados a partir de ${source}`);
