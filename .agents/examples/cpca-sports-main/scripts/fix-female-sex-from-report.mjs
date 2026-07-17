#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

function hasFlag(args, name) {
  return args.includes(name);
}

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

async function loadEnvFile(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;

    let rawValue = trimmed.slice(idx + 1).trim();
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      rawValue = rawValue.slice(1, -1);
    }
    process.env[key] = rawValue;
  }
}

function printUsage() {
  console.log(
    [
      "",
      "Fix female sex values in Convex applications from Report-Pre-Admissions.xlsx",
      "",
      "Usage:",
      "  node scripts/fix-female-sex-from-report.mjs [--execute] [--org-slug cpca-sports] [--report-path public/Report-Pre-Admissions.xlsx]",
      "",
      "Flags:",
      "  --execute       Apply changes. Without this flag it runs in dry-run mode.",
      "  --org-slug      Organization slug scope (default: cpca-sports).",
      "  --report-path   XLSX path (default: public/Report-Pre-Admissions.xlsx).",
      "",
      "Environment variables (required):",
      "  NEXT_PUBLIC_CONVEX_URL",
      "  LEGACY_MIGRATION_SECRET",
      "",
    ].join("\n"),
  );
}

function loadRowsFromReport(reportPath) {
  const pythonScript = `
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

path = sys.argv[1]
z = zipfile.ZipFile(path)
ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

shared_strings = []
if "xl/sharedStrings.xml" in z.namelist():
    shared_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for item in shared_root.findall(".//a:si", ns):
        text = "".join(node.text or "" for node in item.findall(".//a:t", ns))
        shared_strings.append(text)

sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

def col(ref):
    return re.match(r"([A-Z]+)", ref).group(1)

def cell_value(cell):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        node = cell.find("a:is", ns)
        if node is None:
            return ""
        return "".join(part.text or "" for part in node.findall(".//a:t", ns))
    value_node = cell.find("a:v", ns)
    if value_node is None:
        return ""
    value = value_node.text or ""
    if cell_type == "s":
        index = int(value) if value else -1
        if 0 <= index < len(shared_strings):
            return shared_strings[index]
        return ""
    return value

rows = []
for row in sheet.findall(".//a:sheetData/a:row", ns):
    row_number = int(row.attrib.get("r", "0"))
    if row_number == 1:
        continue
    values = {}
    for cell in row.findall("a:c", ns):
        values[col(cell.attrib["r"])] = cell_value(cell)
    full_name = (values.get("B") or "").strip()
    email = (values.get("J") or "").strip().lower()
    if not full_name or not email:
        continue
    rows.append({"fullName": full_name, "email": email})

print(json.dumps(rows))
`;

  const result = spawnSync("python3", ["-c", pythonScript, reportPath], {
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "Unknown parser error";
    throw new Error(`Failed to parse report: ${stderr}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch (error) {
    throw new Error(
      `Report parser returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Report parser did not return an array");
  }

  const deduped = [];
  const seen = new Set();
  for (const row of parsed) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.fullName !== "string" ||
      typeof row.email !== "string"
    ) {
      continue;
    }
    const fullName = row.fullName.trim();
    const email = row.email.trim().toLowerCase();
    if (!fullName || !email) continue;
    const key = `${fullName.toLowerCase()}::${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ fullName, email });
  }

  return deduped;
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const args = process.argv.slice(2);
  if (hasFlag(args, "--help")) {
    printUsage();
    return;
  }

  const execute = hasFlag(args, "--execute");
  const dryRun = !execute;
  const organizationSlug = getArg(args, "--org-slug", "cpca-sports");
  const reportPath = getArg(
    args,
    "--report-path",
    "public/Report-Pre-Admissions.xlsx",
  );

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const migrationSecret = process.env.LEGACY_MIGRATION_SECRET;
  if (!convexUrl || !migrationSecret) {
    throw new Error(
      "Missing required env vars: NEXT_PUBLIC_CONVEX_URL and/or LEGACY_MIGRATION_SECRET",
    );
  }

  await fs.access(reportPath);
  const reportRows = loadRowsFromReport(reportPath);
  if (reportRows.length === 0) {
    throw new Error("No valid rows found in the report");
  }

  console.log(
    `[start] mode=${dryRun ? "dry-run" : "execute"} org=${organizationSlug} reportRows=${reportRows.length}`,
  );

  const convex = new ConvexHttpClient(convexUrl);
  const result = await convex.mutation(
    api.legacyMigration.fixApplicationSexFromFemaleReport,
    {
      secret: migrationSecret,
      organizationSlug,
      reportRows,
      dryRun,
    },
  );

  console.log("");
  console.log("Fix Summary");
  console.log("===========");
  console.log(`Organization ID: ${result.organizationId}`);
  console.log(`Report rows: ${result.reportRows}`);
  console.log(`Applications in org: ${result.applicationsInOrganization}`);
  console.log(`Matched rows: ${result.matchedRows}`);
  console.log(`Already female: ${result.alreadyFemaleApplications}`);
  console.log(`Updated applications: ${result.updatedApplications}`);
  console.log(`Unmatched rows: ${result.unmatchedRows.length}`);
  console.log(`Ambiguous matches: ${result.ambiguousMatches.length}`);

  if (result.unmatchedRows.length > 0) {
    console.log("");
    console.log("Unmatched rows (first 20)");
    for (const row of result.unmatchedRows.slice(0, 20)) {
      console.log(`- ${row.fullName} <${row.email}>`);
    }
    if (result.unmatchedRows.length > 20) {
      console.log(`- ... ${result.unmatchedRows.length - 20} more`);
    }
  }

  if (result.ambiguousMatches.length > 0) {
    console.log("");
    console.log("Ambiguous matches");
    for (const match of result.ambiguousMatches) {
      console.log(`- key=${match.key} ids=${match.applicationIds.join(",")}`);
    }
  }

  if (dryRun) {
    console.log("");
    console.log("[dry-run] No changes applied. Re-run with --execute.");
  }

  if (result.unmatchedRows.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
