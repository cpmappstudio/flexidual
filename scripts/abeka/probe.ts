import { readFile } from "node:fs/promises";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { chromium, type Page } from "@playwright/test";
import {
  AuthenticationRequired, DETAIL_URL, REPORT_URL, ProbeError,
  parseSavedProgress, readProgress, summarize,
} from "./progress";

function options() {
  const { values } = parseArgs({ options: {
    school: { type: "string" }, student: { type: "string" },
    subject: { type: "string", multiple: true },
    sample: { type: "string", multiple: true },
    help: { type: "boolean" },
  } });
  if (values.help) {
    console.log("pnpm exec tsx scripts/abeka/probe.ts --school ID --student ID --subject ID --sample FILE --subject ID --sample FILE");
    process.exit(0);
  }
  const { school, student, subject = [], sample = [] } = values;
  if (!school || !student || subject.length !== 2 || sample.length !== 2 ||
      ![school, student, ...subject].every((id) => /^\d+$/.test(id)) ||
      new Set(subject).size !== 2)
    throw new ProbeError("Indica colegio, estudiante y exactamente dos materias con sus muestras.");
  return { school, student, subject, sample };
}

async function validateRoster(page: Page, school: string, student: string) {
  if (page.url().split("?")[0] !== REPORT_URL ||
      await page.locator("#ddlSchools").inputValue() !== school)
    throw new ProbeError("El reporte no corresponde al colegio autorizado.");
  const matches = await page.locator("#gdvUsers tr").evaluateAll((rows, id) =>
    rows.filter((row) => row.querySelector<HTMLInputElement>("input[id='hidLoginId']")?.value === id)
      .map((row) => ({
        role: row.querySelector("[id='lblUserType']")?.textContent?.trim(),
        status: row.querySelector("[id='bulUserStatus'] li")?.textContent?.trim(),
      })), student);
  if (matches.length !== 1 || matches[0].role !== "Student" || matches[0].status !== "1")
    throw new ProbeError("El estudiante no aparece como activo en este colegio.");
}

async function validateSubjects(page: Page, student: string, subjects: string[]) {
  await page.goto(`${DETAIL_URL}?loginId=${student}`);
  await page.locator("#ddlClasses").waitFor({ state: "attached", timeout: 30_000 });
  if (new URL(page.url()).pathname !== new URL(DETAIL_URL).pathname ||
      await page.locator("#hidLoginId").inputValue() !== student)
    throw new ProbeError("No se pudo verificar el reporte del estudiante.");
  const available = await page.locator("#ddlClasses option").evaluateAll((items) =>
    items.map((item) => (item as HTMLOptionElement).value));
  if (!subjects.every((id) => available.includes(id)))
    throw new ProbeError("Las materias solicitadas no están en el reporte autorizado.");
}

async function probe() {
  const args = options();
  const samples = await Promise.all(args.sample.map(async (path) =>
    parseSavedProgress(await readFile(path, "utf8"))));
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ acceptDownloads: false });
    const page = await context.newPage();
    console.log("Inicia sesión en la ventana de prueba y abre Videos → Reporting. No copies credenciales aquí.");
    await page.goto(REPORT_URL);
    await page.locator("#gdvUsers").waitFor({ state: "attached", timeout: 600_000 });
    await validateRoster(page, args.school, args.student);
    await validateSubjects(page, args.student, args.subject);
    for (const [index, subject] of args.subject.entries()) {
      const rows = await readProgress(context.request, args.student, subject);
      if (rows[0].subjectName !== samples[index][0].subjectName)
        throw new ProbeError("La materia no coincide con la muestra de referencia.");
      console.log(JSON.stringify({ sample: index + 1, ...summarize(rows),
        matchesSavedSample: isDeepStrictEqual(rows, samples[index]) }));
    }
    // A fresh isolated context simulates a missing session without logging out the user.
    const anonymous = await browser.newContext();
    try {
      await readProgress(anonymous.request, args.student, args.subject[0]);
      throw new ProbeError("ATENCIÓN: la consulta devolvió progreso sin sesión. No ampliar la prueba.");
    } catch (error) {
      if (!(error instanceof AuthenticationRequired)) throw error;
      console.log("Sin sesión: acceso rechazado correctamente. No se modificaron datos.");
    } finally {
      await anonymous.close();
    }
    console.log("Prueba finalizada. Sesión descartada; no se guardaron cookies ni respuestas en disco.");
  } finally {
    await browser.close();
  }
}

probe().catch((error: unknown) => {
  console.error(error instanceof ProbeError ? error.message :
    "La prueba no pudo terminar (navegador cerrado, espera agotada o conexión fallida). No se importó nada.");
  process.exitCode = 1;
});
