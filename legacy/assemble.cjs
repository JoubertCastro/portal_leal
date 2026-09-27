const fs = require('node:fs');
let html = fs.readFileSync('hero-leal-v2.html','utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/font:700 16px inherit/g,'font:inherit;font-size:16px;font-weight:700').replace(/font:16px inherit/g,'font:inherit;font-size:16px');
const files=fs.readdirSync('assets');
function externalize(s){for(const f of files){const mime=f.endsWith('.png')?'image/png':'image/jpeg';s=s.split(`data:${mime};base64,${fs.readFileSync('assets/'+f).toString('base64')}`).join('assets/'+f);}return s;}
fs.writeFileSync('styles.css',externalize(css)+fs.readFileSync('sections.css','utf8'));
html=externalize(html).replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="styles.css"><script src="app.js" defer></script>').replace('<title>Leal — Hero / Proposta 02</title>','<title>Leal Assessoria | Negocie suas dívidas</title><meta name="description" content="Conheça o portal de renegociação da Leal Assessoria. Consulte suas opções com clareza e conte com atendimento humano.">');
html=html.replace('<body>','<body><a class="skip" href="#conteudo">Pular para o conteúdo</a>').replace('<main>','<main id="conteudo">').replace('href="https://lealbsb.com.br/sobre.php">Sobre a Leal','href="#sobre">Sobre a Leal').replace('href="https://wa.me/5561995067834">Precisa de ajuda?','href="#ajuda">Precisa de ajuda?');
html=html.replace(/onsubmit="[^"]*"/,'id="access-form" novalidate').replace('autocomplete="off"','autocomplete="off" maxlength="14" aria-required="true"').replace('<div class="demo" id="demo" hidden>Prévia visual: a consulta será conectada na etapa de implementação. Nenhum dado foi enviado.</div>','<p class="error" id="cpf-error" role="alert" hidden></p>');
html=html.replace(/<section class="after"[\s\S]*?<\/section>/,fs.readFileSync('sections.html','utf8'));
html=html.replace('</body>',fs.readFileSync('access.html','utf8')+'</body>');
fs.writeFileSync('index.html',html);
console.log('Página montada: index.html, styles.css, app.js');
