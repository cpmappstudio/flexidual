import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { ProbeError } from "./progress";
import { probeSession } from "./session-probe";

const MAX_BODY_BYTES = 20_000;

function page(token: string, nonce: string) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Prueba local de sesión Abeka</title>
<style nonce="${nonce}">body{font:17px system-ui;max-width:700px;margin:60px auto;padding:24px;color:#223}input,button{font:inherit;padding:12px;margin:12px 0;box-sizing:border-box}input{width:100%}button{cursor:pointer}pre{white-space:pre-wrap}small{display:block}</style>
<h1>Prueba local de Abeka</h1>
<p>Esta prueba consulta dos materias del estudiante ya autorizado. No guarda la sesión ni importa datos a Flexidual. La conexión sale desde Node.js, no desde Safari.</p>
<ol><li>En la pestaña de Abeka, abre el inspector → Red / Network y recarga el reporte.</li>
<li>Selecciona la petición a <strong>StreamingDetails.aspx</strong> del dominio <strong>atschool.abeka.com</strong>.</li>
<li>En los encabezados de la petición busca <strong>Cookie</strong> y copia solo su valor. No copies contraseñas, un HAR ni un comando cURL.</li></ol>
<form autocomplete="off"><label for="session">Valor de Cookie</label><input id="session" type="password" autocomplete="off" spellcheck="false" maxlength="16384" required>
<small>Trátalo como una contraseña. No lo pegues en el chat. Después de enviarlo, sustituye el contenido de tu portapapeles por un texto sin datos privados.</small>
<button>Comprobar desde el servidor local</button></form><pre role="status" aria-live="polite" id="result"></pre>
<p>Una respuesta correcta no demuestra todavía que la sesión dure una semana ni que funcione desde otra IP.</p>
<script nonce="${nonce}">
const form=document.querySelector('form'), field=document.querySelector('input'), button=document.querySelector('button'), result=document.querySelector('#result');
form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;result.textContent='Consultando…';
let body=JSON.stringify({cookie:field.value});field.value='';
try{const pending=fetch('/probe',{method:'POST',headers:{'Content-Type':'application/json','X-Probe-Token':'${token}'},body,cache:'no-store'});body='';const response=await pending;const data=await response.json();result.textContent=data.ok?'Lectura desde Node.js correcta. Sesión no guardada.\\n'+JSON.stringify(data.result.results,null,2):data.error;}catch{result.textContent='La prueba local ya no está disponible. La sesión no se guardó.';}finally{body='';button.disabled=false;}});
window.addEventListener('pagehide',()=>{field.value='';});
</script></html>`;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new ProbeError("Entrada demasiado grande.");
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  try { return JSON.parse(buffer.toString("utf8")) as { cookie?: unknown }; }
  finally { buffer.fill(0); for (const chunk of chunks) chunk.fill(0); }
}

export function createSessionProbeServer(run = probeSession) {
  const token = randomBytes(32).toString("hex");
  const nonce = randomBytes(24).toString("hex");
  let busy = false;
  let attempts = 0;
  const server = createServer(async (request, response) => {
    const address = server.address();
    if (!address || typeof address === "string") return response.end();
    const host = `127.0.0.1:${address.port}`;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`);
    if (request.headers.host !== host) { response.writeHead(403); return response.end(); }
    if (request.method === "GET" && request.url === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      return response.end(page(token, nonce));
    }
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.method !== "POST" || request.url !== "/probe") {
      response.writeHead(404); return response.end(JSON.stringify({ ok: false, error: "Ruta no disponible." }));
    }
    if (request.headers.origin !== `http://${host}` || request.headers["x-probe-token"] !== token ||
        request.headers["content-type"] !== "application/json") {
      response.writeHead(403); return response.end(JSON.stringify({ ok: false, error: "Petición rechazada." }));
    }
    if (busy || attempts >= 5) {
      response.writeHead(429); return response.end(JSON.stringify({ ok: false, error: "Prueba ocupada o límite de intentos alcanzado." }));
    }
    busy = true; attempts++;
    try {
      const payload = await readBody(request);
      const pending = run(payload?.cookie);
      if (payload) delete payload.cookie;
      const result = await pending;
      response.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      response.writeHead(400);
      response.end(JSON.stringify({ ok: false, error: error instanceof ProbeError ? error.message : "Entrada o conexión inválida. No se guardó la sesión." }));
    } finally { busy = false; }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  return server;
}
