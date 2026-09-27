const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
http.createServer((req,res)=>{
  let name; try {name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);return res.end();}
  if (name==='/') name='/index.html';
  if (!/^\/(index\.html|styles\.css|app\.js|assets\/[\w.-]+)$/.test(name)) {res.writeHead(404);return res.end('Não encontrado');}
  const file=path.join(root,name);
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Não encontrado');}res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.end(data);});
}).listen(Number(process.env.PORT)||4174,'127.0.0.1',()=>console.log('Portal Leal: http://127.0.0.1:'+(process.env.PORT||4174)));
