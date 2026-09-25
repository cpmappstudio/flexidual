import { createSessionProbeServer } from "./local-session-form";

const server = createSessionProbeServer();
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address && typeof address !== "string")
    console.log(`Prueba local: http://127.0.0.1:${address.port}/ — caduca en 15 minutos.`);
});
const stop = () => { server.closeAllConnections(); server.close(); clearTimeout(expiry); };
const expiry = setTimeout(stop, 15 * 60_000);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
server.on("error", () => { console.error("No se pudo abrir la prueba local."); stop(); process.exitCode = 1; });
