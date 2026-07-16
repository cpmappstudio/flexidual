#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import mysql from "mysql2/promise";
import countries from "world-countries";
import { ConvexHttpClient } from "convex/browser";
import { createClerkClient } from "@clerk/backend";
import { api } from "../convex/_generated/api.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LEGACY_DOCUMENT_TYPE_MAP = {
  550: "arrival_departure_dates",
  551: "athletic_permission_parent",
  552: "athletic_permission_physician",
  553: "birth_certificate",
  554: "medical_insurance",
  555: "social_security",
  556: "visa",
  557: "father_id",
  558: "federal_scholarship",
  559: "housing_rules",
  560: "i20_letter",
  561: "i20_form",
  562: "immunization_record",
  563: "legal_guardian_id",
  564: "mother_id",
  565: "official_transcript",
  566: "passport",
  567: "student_id",
};

function hasFlag(args, name) {
  return args.includes(name);
}

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function normalizeSpaces(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return normalizeSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  const email = normalizeSpaces(value).toLowerCase();
  return email || null;
}

function isValidEmail(email) {
  return Boolean(email) && EMAIL_RE.test(email);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dollarsToCents(value) {
  return Math.round(toNumber(value, 0) * 100);
}

function parseTimestamp(value, fallback = Date.now()) {
  if (!value) return fallback;
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? fallback : t;
}

function parseDateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function boolFromLegacy(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "y" || raw === "yes" || raw === "true";
}

function joinAddress(...parts) {
  return parts
    .map((part) => normalizeSpaces(part))
    .filter(Boolean)
    .join(", ");
}

function guessContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".heic") return "image/heic";
  if (ext === ".heif") return "image/heif";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "application/octet-stream";
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

class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  make(value) {
    if (!this.parent.has(value)) {
      this.parent.set(value, value);
      this.rank.set(value, 0);
    }
  }

  find(value) {
    this.make(value);
    let parent = this.parent.get(value);
    while (parent !== this.parent.get(parent)) {
      parent = this.parent.get(parent);
    }
    let node = value;
    while (node !== parent) {
      const next = this.parent.get(node);
      this.parent.set(node, parent);
      node = next;
    }
    return parent;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return rootA;

    const rankA = this.rank.get(rootA) ?? 0;
    const rankB = this.rank.get(rootB) ?? 0;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      return rootB;
    }
    if (rankA > rankB) {
      this.parent.set(rootB, rootA);
      return rootA;
    }

    this.parent.set(rootB, rootA);
    this.rank.set(rootA, rankA + 1);
    return rootA;
  }
}

function createParamHelpers(paramsRows) {
  const byId = new Map();
  for (const row of paramsRows) {
    byId.set(Number(row.id), row);
  }

  return {
    byId,
    name(id) {
      if (id === null || id === undefined) return "";
      return normalizeSpaces(byId.get(Number(id))?.name);
    },
    description(id) {
      if (id === null || id === undefined) return "";
      return normalizeSpaces(byId.get(Number(id))?.description);
    },
  };
}

function createCountryResolver() {
  const lookup = new Map();

  const add = (name, code) => {
    const key = normalizeKey(name);
    if (!key) return;
    if (!lookup.has(key)) lookup.set(key, code);
  };

  for (const country of countries) {
    const code = country.cca2;
    add(country.name?.common, code);
    add(country.name?.official, code);
    for (const alt of country.altSpellings ?? []) {
      add(alt, code);
    }
    add(country.cca3, code);
  }

  return {
    toCode(name) {
      const normalized = normalizeKey(name);
      if (!normalized) return "";
      return lookup.get(normalized) ?? "";
    },
  };
}

function mapApplicationStatus(responseCode, responseName) {
  const code = Number(responseCode);
  if (code === 115) return "pending";
  if (code === 116) return "reviewing";
  if (code === 117) return "pre-admitted";
  if (code === 118) return "admitted";
  if (code === 119) return "denied";

  const normalized = normalizeKey(responseName);
  if (normalized.includes("review")) return "reviewing";
  if (normalized.includes("pre admitted")) return "pre-admitted";
  if (normalized.includes("admitted")) return "admitted";
  if (normalized.includes("denied")) return "denied";
  return "pending";
}

function mapProgram(programName) {
  const key = normalizeKey(programName);
  if (key === "baseball") return "baseball";
  if (key === "basketball") return "basketball";
  if (key === "soccer") return "soccer";
  if (key === "volleyball") return "volleyball";
  if (key === "hr14 baseball") return "hr14_baseball";
  if (key === "golf") return "golf";
  if (key === "tennis") return "tennis";
  if (key === "softball") return "softball";
  if (key === "volleyball club") return "volleyball-club";
  if (key === "pg basketball") return "pg-basketball";
  return "";
}

function mapGradeEntering(gradeName) {
  const key = normalizeKey(gradeName);
  if (key.includes("post graduate")) return "postgraduate";
  const match = key.match(/\b([0-9]{1,2})\b/);
  if (match) return match[1];
  return "";
}

function mapSchoolType(schoolTypeName) {
  const key = normalizeKey(schoolTypeName);
  if (key.includes("elementary")) return "elementary";
  if (key.includes("middle")) return "middle";
  if (key.includes("high")) return "high";
  if (key.includes("post")) return "postgraduate";
  return "";
}

function mapRelationship(value) {
  const key = normalizeKey(value);
  if (!key) return "";
  if (key === "f" || key.includes("father")) return "father";
  if (key === "m" || key.includes("mother")) return "mother";
  return "";
}

function mapPersonSubmitting(name) {
  const key = normalizeKey(name);
  if (key.includes("athlete") || key.includes("self")) return "self";
  if (key.includes("parent")) return "parent";
  if (key.includes("guidance")) return "guidance";
  if (key.includes("administration")) return "administration";
  if (key.includes("coach")) return "coach";
  return "other";
}

function mapHowDidYouHear(name) {
  const key = normalizeKey(name);
  if (key.includes("instagram") || key.includes("twitter"))
    return "socialMedia";
  if (key.includes("friend")) return "friend";
  if (key.includes("coach")) return "coach";
  if (key.includes("teacher")) return "teacher";
  return "other";
}

function mapFormatAndI20(legalName, studentVisaRaw) {
  const legal = normalizeKey(legalName);
  const hasVisa = boolFromLegacy(studentVisaRaw);

  if (legal.includes("american citizen") || legal.includes("resident")) {
    return { format: "american", needsI20: "no-citizen" };
  }

  if (legal.includes("international")) {
    if (hasVisa) {
      return { format: "international", needsI20: "yes-transfer" };
    }
    return { format: "international", needsI20: "yes-new" };
  }

  if (hasVisa) {
    return { format: "international", needsI20: "yes-transfer" };
  }
  return { format: "american", needsI20: "no-non-citizen" };
}

function parseEnrollmentYear(enrollmentName) {
  const key = normalizeSpaces(enrollmentName);
  const match = key.match(/\b(20[0-9]{2})\b/);
  return match ? match[1] : "";
}

function buildFormData(pre, params, countryResolver) {
  const legalName = params.name(pre.p_legal);
  const { format, needsI20 } = mapFormatAndI20(legalName, pre.student_visa);

  const enrollmentName = params.name(pre.p_enrollment_year);
  const programName = params.name(pre.p_program);
  const sexName = params.name(pre.p_sex);
  const gradeName = params.name(pre.p_grade_entering);
  const interestName = params.name(pre.p_program_interest);
  const schoolTypeName = params.name(pre.p_school_type);
  const personName = params.name(pre.p_person);
  const aboutUsName = params.name(pre.p_about_us);

  const sexNormalized = normalizeKey(sexName);
  const sex = sexNormalized.includes("female")
    ? "female"
    : sexNormalized.includes("male")
      ? "male"
      : "other";

  const program = mapProgram(programName);
  const gradeEntering = mapGradeEntering(gradeName);
  const programOfInterest = mapSchoolType(interestName);
  const currentSchoolType = mapSchoolType(schoolTypeName);

  const countryOfBirthName = params.name(pre.p_country_birth);
  const countryOfCitizenshipName = params.name(pre.p_country_citizenship);
  const currentCountryName = params.name(pre.p_current_country);
  const schoolCountryName = params.name(pre.p_school_country);

  const currentStateName = params.name(pre.p_current_state);
  const schoolStateName = params.name(pre.p_school_state);

  const formData = {
    athlete: {
      photo: null,
      format,
      program,
      enrollmentYear: parseEnrollmentYear(enrollmentName),
      graduationYear: normalizeSpaces(pre.graduation_year),
      firstName: normalizeSpaces(pre.first_name),
      lastName: normalizeSpaces(pre.last_names),
      sex,
      height: `${toNumber(pre.height_feet, 0)}-${toNumber(pre.height_inches, 0)}`,
      birthDate: parseDateOnly(pre.birthday),
      email: normalizeSpaces(pre.email),
      telephone: normalizeSpaces(pre.telephone),
      countryOfBirth:
        countryResolver.toCode(countryOfBirthName) || countryOfBirthName,
      countryOfCitizenship:
        countryResolver.toCode(countryOfCitizenshipName) ||
        countryOfCitizenshipName,
      highlightsLink: normalizeSpaces(pre.highlight_link),
      gradeEntering,
      programOfInterest,
      needsI20,
    },
    address: {
      country: countryResolver.toCode(currentCountryName) || currentCountryName,
      state: currentStateName,
      city: normalizeSpaces(pre.current_city),
      streetAddress: joinAddress(pre.current_address_1, pre.current_address_2),
      zipCode: normalizeSpaces(pre.current_zipcode),
    },
    school: {
      currentSchoolName: normalizeSpaces(pre.school_name),
      currentSchoolType,
      currentGPA: normalizeSpaces(pre.school_gpa),
      schoolAddress: joinAddress(pre.school_address_1, pre.school_address_2),
      schoolCity: normalizeSpaces(pre.school_city),
      schoolCountry:
        countryResolver.toCode(schoolCountryName) || schoolCountryName,
      schoolState: schoolStateName,
      schoolZipCode: normalizeSpaces(pre.school_zipcode),
      referenceFullName: normalizeSpaces(pre.school_reference_name),
      referencePhone: normalizeSpaces(pre.school_reference_phone),
      referenceRelationship: normalizeSpaces(pre.school_reference_ocupation),
    },
    parents: {
      parent1FirstName: normalizeSpaces(pre.parent_1_first_name),
      parent1LastName: normalizeSpaces(pre.parent_1_last_names),
      parent1Relationship: mapRelationship(pre.parent_1_relationship),
      parent1Email: normalizeSpaces(pre.parent_1_email),
      parent1Telephone: normalizeSpaces(pre.parent_1_telephone),
      parent2FirstName: normalizeSpaces(pre.parent_2_first_name),
      parent2LastName: normalizeSpaces(pre.parent_2_last_names),
      parent2Relationship: mapRelationship(pre.parent_2_relationship),
      parent2Email: normalizeSpaces(pre.parent_2_email),
      parent2Telephone: normalizeSpaces(pre.parent_2_telephone),
    },
    general: {
      personSubmitting: mapPersonSubmitting(personName),
      howDidYouHear: mapHowDidYouHear(aboutUsName),
      interestedInBoarding: boolFromLegacy(pre.p_interest_boarding)
        ? "yes"
        : "no",
      message: normalizeSpaces(pre.message),
    },
    legacy: {
      legacyPreadmissionId: Number(pre.id),
      legacyCode: normalizeSpaces(pre.code),
      legacyPResponse: Number(pre.p_response ?? 0),
      legacyPState: Number(pre.p_state ?? 0),
      legacyPControl: Number(pre.p_control ?? 0),
      legacyStudentVisa: boolFromLegacy(pre.student_visa),
      legacyPicturePath: normalizeSpaces(pre.picture),
      legacyCreatedAt: parseTimestamp(pre.created_at),
      legacyUpdatedAt: parseTimestamp(pre.updated_at),
    },
  };

  return formData;
}

function buildPaymentsPayload(paymentRows) {
  return paymentRows.map((pay) => {
    const serviceName = normalizeSpaces(pay.service_name) || "Legacy Fee";
    const description = normalizeSpaces(pay.description);
    const name =
      normalizeKey(serviceName) === "other" && description
        ? description
        : serviceName;

    const detailParts = [];
    if (description && name !== description) detailParts.push(description);
    if (pay.p_service) detailParts.push(`legacy_service_id=${pay.p_service}`);
    if (pay.payment_method_name) {
      detailParts.push(
        `legacy_method=${normalizeSpaces(pay.payment_method_name)}`,
      );
    }
    if (pay.pp !== null && pay.pp !== undefined && String(pay.pp) !== "") {
      detailParts.push(`legacy_pp=${String(pay.pp)}`);
    }

    // In legacy data, `payments.due` stores the amount already paid.
    const totalAmountCents = dollarsToCents(pay.amount);
    const paidAmountRawCents = dollarsToCents(pay.due);
    const paidAmountCents = Math.max(
      0,
      Math.min(totalAmountCents, paidAmountRawCents),
    );
    const pendingAmountCents = Math.max(0, totalAmountCents - paidAmountCents);
    if (paidAmountRawCents !== paidAmountCents) {
      detailParts.push(`legacy_paid_raw_cents=${paidAmountRawCents}`);
    }

    const mergedDescription = detailParts.join(" | ");

    return {
      legacyPaymentId: String(pay.id),
      name,
      description: mergedDescription || undefined,
      totalAmountCents,
      dueAmountCents: pendingAmountCents,
      downPaymentPercent: toNumber(pay.dp, 0),
      isRefundable: boolFromLegacy(pay.refundable),
      isIncluded: boolFromLegacy(pay.included),
      isRequired: !boolFromLegacy(pay.included),
      createdAt: parseTimestamp(pay.created_at),
      updatedAt: parseTimestamp(pay.updated_at),
      legacyMethod: normalizeSpaces(pay.payment_method_name) || undefined,
      reference: `legacy-payment-${pay.id}`,
    };
  });
}

function buildAccountAssignments(preRows, strategy) {
  const appToBase = new Map();

  const baseKeyFor = (pre) =>
    normalizeEmail(pre.parent_1_email) ??
    normalizeEmail(pre.parent_2_email) ??
    normalizeEmail(pre.email) ??
    `legacy-no-email-${pre.id}`;

  if (strategy === "parent1") {
    for (const pre of preRows) {
      appToBase.set(Number(pre.id), baseKeyFor(pre));
    }
    return appToBase;
  }

  if (strategy === "swap") {
    const uf = new UnionFind();
    const pairOwner = new Map();

    for (const pre of preRows) {
      const appId = Number(pre.id);
      const base = baseKeyFor(pre);
      appToBase.set(appId, base);
      uf.make(base);

      const p1 = normalizeEmail(pre.parent_1_email);
      const p2 = normalizeEmail(pre.parent_2_email);
      if (p1 && p2) {
        const pairKey = [p1, p2].sort().join("|");
        const existingOwner = pairOwner.get(pairKey);
        if (existingOwner) {
          uf.union(base, existingOwner);
        } else {
          pairOwner.set(pairKey, base);
        }
      }
    }

    for (const [appId, base] of appToBase.entries()) {
      appToBase.set(appId, uf.find(base));
    }
    return appToBase;
  }

  if (strategy === "graph") {
    const uf = new UnionFind();

    for (const pre of preRows) {
      const appId = Number(pre.id);
      const base = baseKeyFor(pre);
      appToBase.set(appId, base);
      uf.make(base);

      const p1 = normalizeEmail(pre.parent_1_email);
      const p2 = normalizeEmail(pre.parent_2_email);

      if (p1) {
        uf.make(p1);
        uf.union(base, p1);
      }
      if (p2) {
        uf.make(p2);
        uf.union(base, p2);
      }
      if (p1 && p2) {
        uf.union(p1, p2);
      }
    }

    for (const [appId, base] of appToBase.entries()) {
      appToBase.set(appId, uf.find(base));
    }
    return appToBase;
  }

  throw new Error(
    `Unknown account strategy "${strategy}". Use parent1, swap, or graph.`,
  );
}

function chooseMostFrequent(items) {
  const counts = new Map();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }

  let best = null;
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
      continue;
    }
    if (count === bestCount && best !== null && value < best) {
      best = value;
    }
  }
  return best;
}

function buildAccounts(preRows, appToAccountKey) {
  const grouped = new Map();
  const preById = new Map(preRows.map((pre) => [Number(pre.id), pre]));

  for (const [appId, accountKey] of appToAccountKey.entries()) {
    const group = grouped.get(accountKey) ?? [];
    group.push(appId);
    grouped.set(accountKey, group);
  }

  const accounts = [];
  const appIdToAccount = new Map();

  for (const [accountKey, appIds] of grouped.entries()) {
    const apps = appIds.map((appId) => preById.get(appId)).filter(Boolean);
    const parent1Emails = apps
      .map((pre) => normalizeEmail(pre.parent_1_email))
      .filter(isValidEmail);
    const parent2Emails = apps
      .map((pre) => normalizeEmail(pre.parent_2_email))
      .filter(isValidEmail);
    const studentEmails = apps
      .map((pre) => normalizeEmail(pre.email))
      .filter(isValidEmail);

    const primaryEmail =
      chooseMostFrequent(parent1Emails) ??
      chooseMostFrequent(parent2Emails) ??
      chooseMostFrequent(studentEmails) ??
      `legacy+${sha1(`${accountKey}:${appIds.join(",")}`).slice(0, 12)}@example.com`;

    const aliases = Array.from(
      new Set([...parent1Emails, ...parent2Emails, ...studentEmails]),
    );

    const matchingParent1 = apps.find(
      (pre) => normalizeEmail(pre.parent_1_email) === primaryEmail,
    );
    const matchingParent2 = apps.find(
      (pre) => normalizeEmail(pre.parent_2_email) === primaryEmail,
    );

    const firstName =
      normalizeSpaces(
        matchingParent1?.parent_1_first_name ??
          matchingParent2?.parent_2_first_name ??
          apps[0]?.parent_1_first_name,
      ) || "Parent";
    const lastName =
      normalizeSpaces(
        matchingParent1?.parent_1_last_names ??
          matchingParent2?.parent_2_last_names ??
          apps[0]?.parent_1_last_names,
      ) || `Legacy-${appIds[0]}`;

    const legacyAccountId = `acct:${sha1(`${accountKey}:${appIds.join(",")}`).slice(0, 16)}`;

    const account = {
      accountKey,
      legacyAccountId,
      appIds: [...appIds].sort((a, b) => a - b),
      primaryEmail,
      aliases,
      firstName,
      lastName,
    };

    accounts.push(account);
    for (const appId of appIds) {
      appIdToAccount.set(appId, account);
    }
  }

  accounts.sort((a, b) => b.appIds.length - a.appIds.length);
  return { accounts, appIdToAccount };
}

function relativeToUrlPath(relativePath) {
  return relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function readLegacyFile(relativePath, fileConfig) {
  const safePath = String(relativePath ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");

  if (!safePath || safePath.includes("..")) {
    return null;
  }

  const candidates = [safePath];
  if (safePath.startsWith("img/")) {
    candidates.push(safePath.slice(4));
  }
  if (safePath.startsWith("public/")) {
    candidates.push(safePath.slice(7));
  }

  if (fileConfig.filesRoot) {
    const root = path.resolve(fileConfig.filesRoot);
    for (const candidate of candidates) {
      const absolutePath = path.resolve(fileConfig.filesRoot, candidate);
      if (!absolutePath.startsWith(root)) {
        continue;
      }
      try {
        const buffer = await fs.readFile(absolutePath);
        return {
          source: "local",
          originalPath: safePath,
          fileName: path.basename(candidate),
          contentType: guessContentType(candidate),
          buffer,
        };
      } catch {
        // Continue to next candidate or URL fallback.
      }
    }
  }

  if (fileConfig.filesBaseUrl) {
    const base = fileConfig.filesBaseUrl.endsWith("/")
      ? fileConfig.filesBaseUrl
      : `${fileConfig.filesBaseUrl}/`;
    for (const candidate of candidates) {
      const fileUrl = new URL(relativeToUrlPath(candidate), base);
      const response = await fetch(fileUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return {
          source: "url",
          originalPath: safePath,
          fileName: path.basename(candidate),
          contentType:
            response.headers.get("content-type") || guessContentType(candidate),
          buffer: Buffer.from(arrayBuffer),
        };
      }
    }
  }

  return null;
}

async function uploadToConvexStorage(convex, file, migrationSecret) {
  const uploadUrl = await convex.mutation(
    api.files.generateUploadUrlForMigration,
    {
      secret: migrationSecret,
    },
  );
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.contentType,
    },
    body: file.buffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Upload failed (${uploadResponse.status}) for ${file.originalPath}`,
    );
  }

  const payload = await uploadResponse.json();
  if (!payload.storageId) {
    throw new Error(
      `Upload response missing storageId for ${file.originalPath}`,
    );
  }

  return payload.storageId;
}

function mapClerkRoleToConvexRole(clerkRole) {
  if (clerkRole === "admin" || clerkRole === "org:admin") return "admin";
  if (clerkRole === "superadmin" || clerkRole === "org:superadmin")
    return "superadmin";
  if (clerkRole === "member" || clerkRole === "org:member") return "member";
  return "member";
}

function clerkErrorSummary(error) {
  if (!error) return "Unknown Clerk error";
  if (typeof error === "string") return error;

  const topLevel = error.message
    ? String(error.message)
    : "Unknown Clerk error";
  const first = error.errors?.[0];
  if (!first) return topLevel;

  const code = first.code ? String(first.code) : "unknown_code";
  const msg = first.message ? String(first.message) : "";
  return `${topLevel} (${code}${msg ? `: ${msg}` : ""})`;
}

async function resolveActor({
  clerk,
  convex,
  organization,
  migrationSecret,
  source,
  dryRun,
  singleTenantMode,
  explicitActorEmail,
  explicitActorClerkId,
}) {
  let actorUser = null;
  let actorMembership = null;
  let actorIsSuperAdmin = false;

  if (explicitActorClerkId) {
    actorUser = await clerk.users.getUser(explicitActorClerkId);
    if (!singleTenantMode) {
      const memberships =
        await clerk.organizations.getOrganizationMembershipList({
          organizationId: organization.clerkOrgId,
          userId: [explicitActorClerkId],
          limit: 1,
        });
      actorMembership = memberships.data[0] ?? null;
    }
  } else if (explicitActorEmail) {
    const users = await clerk.users.getUserList({
      emailAddress: [explicitActorEmail],
      limit: 1,
    });
    actorUser = users.data[0] ?? null;

    // In single-tenant mode we can't resolve an actor from org memberships.
    // For a fresh Clerk production instance, auto-create the actor when running in execute mode.
    if (!actorUser && singleTenantMode) {
      if (dryRun) {
        actorUser = {
          id: `dryrun_actor_${sha1(explicitActorEmail).slice(0, 24)}`,
          firstName: "Migration",
          lastName: "Actor",
          emailAddresses: [{ emailAddress: explicitActorEmail }],
          publicMetadata: { role: "admin" },
        };
      } else {
        actorUser = await clerk.users.createUser({
          emailAddress: [explicitActorEmail],
          firstName: "Migration",
          lastName: "Actor",
          skipPasswordRequirement: true,
          skipPasswordChecks: true,
          skipLegalChecks: true,
          publicMetadata: { role: "admin" },
          privateMetadata: {
            legacyMigration: {
              source,
              kind: "actor",
            },
          },
        });
      }
    }

    if (actorUser && !singleTenantMode) {
      const memberships =
        await clerk.organizations.getOrganizationMembershipList({
          organizationId: organization.clerkOrgId,
          userId: [actorUser.id],
          limit: 1,
        });
      actorMembership = memberships.data[0] ?? null;
    }
  }

  if (!actorUser) {
    if (singleTenantMode) {
      throw new Error(
        "Could not resolve migration actor user in single-tenant mode. Set MIGRATION_ACTOR_CLERK_ID or MIGRATION_ACTOR_EMAIL.",
      );
    }

    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: organization.clerkOrgId,
        limit: 100,
      },
    );
    actorMembership =
      memberships.data.find(
        (m) => m.role === "org:admin" || m.role === "org:superadmin",
      ) ?? memberships.data[0];

    if (!actorMembership?.publicUserData?.userId) {
      throw new Error(
        "Could not resolve migration actor from organization memberships",
      );
    }
    actorUser = await clerk.users.getUser(
      actorMembership.publicUserData.userId,
    );
  }

  if (!actorUser) {
    throw new Error("Could not resolve migration actor user");
  }

  if (singleTenantMode) {
    const actorPublicMetadata =
      actorUser.publicMetadata && typeof actorUser.publicMetadata === "object"
        ? actorUser.publicMetadata
        : {};
    actorIsSuperAdmin = actorPublicMetadata.isSuperAdmin === true;
    const actorRoleFromMetadata = mapClerkRoleToConvexRole(
      actorPublicMetadata.role,
    );
    const actorRole = actorIsSuperAdmin
      ? "superadmin"
      : actorRoleFromMetadata === "member"
        ? "admin"
        : actorRoleFromMetadata;
    actorMembership = {
      id: `single:${actorUser.id}:${organization._id}`,
      role: actorRole,
      publicUserData: null,
    };
  } else {
    if (!actorMembership) {
      const memberships =
        await clerk.organizations.getOrganizationMembershipList({
          organizationId: organization.clerkOrgId,
          userId: [actorUser.id],
          limit: 1,
        });
      actorMembership = memberships.data[0] ?? null;
    }

    if (!actorMembership && !dryRun) {
      actorMembership = await clerk.organizations.createOrganizationMembership({
        organizationId: organization.clerkOrgId,
        userId: actorUser.id,
        role: "org:admin",
      });
    }
  }

  const primaryEmail =
    actorUser.emailAddresses?.[0]?.emailAddress ??
    actorMembership?.publicUserData?.identifier;
  const firstName =
    actorUser.firstName ??
    actorMembership?.publicUserData?.firstName ??
    "Migration";
  const lastName =
    actorUser.lastName ?? actorMembership?.publicUserData?.lastName ?? "Actor";

  const actor = {
    clerkUserId: actorUser.id,
    clerkMembershipId: actorMembership?.id ?? `synthetic-${actorUser.id}`,
    role: mapClerkRoleToConvexRole(
      actorMembership?.role ?? (singleTenantMode ? "admin" : "org:admin"),
    ),
    isSuperAdmin: actorIsSuperAdmin,
    email:
      normalizeSpaces(primaryEmail) || `migration+${actorUser.id}@example.com`,
    firstName: normalizeSpaces(firstName) || "Migration",
    lastName: normalizeSpaces(lastName) || "Actor",
    convexUserId: null,
  };

  if (!dryRun) {
    const accountResult = await convex.mutation(
      api.legacyMigration.upsertAccountFromClerk,
      {
        secret: migrationSecret,
        source,
        legacyAccountId: `system:actor:${actor.clerkUserId}`,
        clerkUserId: actor.clerkUserId,
        email: actor.email,
        firstName: actor.firstName,
        lastName: actor.lastName,
        isSuperAdmin: actor.isSuperAdmin,
      },
    );
    actor.convexUserId = accountResult.userId;

    await convex.mutation(api.legacyMigration.upsertMembershipFromClerk, {
      secret: migrationSecret,
      source,
      legacyMembershipId: `system:actor:${actor.clerkUserId}:${organization._id}`,
      userId: accountResult.userId,
      organizationId: organization._id,
      clerkMembershipId: actor.clerkMembershipId,
      role: actor.role,
    });
  }

  return actor;
}

async function ensureAccount({
  account,
  clerk,
  convex,
  organization,
  migrationSecret,
  source,
  dryRun,
  singleTenantMode,
  allowSyntheticUsers,
}) {
  let clerkUser = null;
  let clerkMembership = null;
  let clerkUserCreated = false;
  let clerkMembershipCreated = false;
  let isSyntheticUser = false;

  if (dryRun) {
    return {
      clerkUser: null,
      clerkMembership: null,
      clerkUserCreated: false,
      clerkMembershipCreated: false,
      convexUserId: null,
      convexMembershipId: null,
      isSyntheticUser: false,
    };
  }

  const fallbackEmail = `legacy+${sha1(account.legacyAccountId).slice(0, 12)}@example.com`;
  const emailCandidates = Array.from(
    new Set([account.primaryEmail, ...account.aliases, fallbackEmail]),
  ).filter(Boolean);

  let creationErrors = [];
  for (const emailCandidate of emailCandidates) {
    const existingUsers = await clerk.users.getUserList({
      emailAddress: [emailCandidate],
      limit: 1,
    });
    clerkUser = existingUsers.data[0] ?? null;
    if (clerkUser) {
      break;
    }

    if (dryRun) {
      continue;
    }

    try {
      clerkUser = await clerk.users.createUser({
        emailAddress: [emailCandidate],
        firstName: account.firstName,
        lastName: account.lastName,
        skipPasswordRequirement: true,
        skipPasswordChecks: true,
        skipLegalChecks: true,
        publicMetadata: {
          role: "member",
        },
        privateMetadata: {
          legacyMigration: {
            source,
            legacyAccountId: account.legacyAccountId,
            aliases: account.aliases,
            appCount: account.appIds.length,
          },
        },
      });
      clerkUserCreated = true;
      break;
    } catch (error) {
      creationErrors.push(
        `email=${emailCandidate} -> ${clerkErrorSummary(error)}`,
      );
    }
  }

  if (!clerkUser && creationErrors.length > 0) {
    const onlyQuotaErrors = creationErrors.every((entry) =>
      entry.includes("user_quota_exceeded"),
    );
    if (allowSyntheticUsers && onlyQuotaErrors && !dryRun) {
      isSyntheticUser = true;
      clerkUser = {
        id: `legacy_synth_${sha1(account.legacyAccountId).slice(0, 24)}`,
        firstName: account.firstName,
        lastName: account.lastName,
        emailAddresses: [{ emailAddress: account.primaryEmail }],
      };
    } else {
      throw new Error(
        `Could not create Clerk user for ${account.legacyAccountId}. ${creationErrors.join(" | ")}`,
      );
    }
  }

  if (!clerkUser) {
    return {
      clerkUser: null,
      clerkMembership: null,
      clerkUserCreated,
      clerkMembershipCreated,
      convexUserId: null,
      convexMembershipId: null,
    };
  }

  if (singleTenantMode) {
    clerkMembership = {
      id: `single:${clerkUser.id}:${organization._id}`,
      role: "member",
    };
    clerkMembershipCreated = true;
  } else if (!isSyntheticUser) {
    const memberships = await clerk.organizations.getOrganizationMembershipList(
      {
        organizationId: organization.clerkOrgId,
        userId: [clerkUser.id],
        limit: 1,
      },
    );
    clerkMembership = memberships.data[0] ?? null;

    if (!clerkMembership && !dryRun) {
      clerkMembership = await clerk.organizations.createOrganizationMembership({
        organizationId: organization.clerkOrgId,
        userId: clerkUser.id,
        role: "org:member",
      });
      clerkMembershipCreated = true;
    }
  } else {
    clerkMembership = {
      id: `synthetic_membership_${organization._id}_${clerkUser.id}`,
      role: "org:member",
    };
    clerkMembershipCreated = true;
  }

  if (dryRun) {
    return {
      clerkUser,
      clerkMembership,
      clerkUserCreated,
      clerkMembershipCreated,
      convexUserId: null,
      convexMembershipId: null,
      isSyntheticUser,
    };
  }

  const accountResult = await convex.mutation(
    api.legacyMigration.upsertAccountFromClerk,
    {
      secret: migrationSecret,
      source,
      legacyAccountId: account.legacyAccountId,
      clerkUserId: clerkUser.id,
      email:
        clerkUser.emailAddresses?.[0]?.emailAddress ?? account.primaryEmail,
      firstName: clerkUser.firstName ?? account.firstName,
      lastName: clerkUser.lastName ?? account.lastName,
      isSuperAdmin: false,
    },
  );

  const membershipResult = await convex.mutation(
    api.legacyMigration.upsertMembershipFromClerk,
    {
      secret: migrationSecret,
      source,
      legacyMembershipId: `membership:${account.legacyAccountId}:${organization._id}`,
      userId: accountResult.userId,
      organizationId: organization._id,
      clerkMembershipId:
        clerkMembership?.id ?? `synthetic:${organization._id}:${clerkUser.id}`,
      role: mapClerkRoleToConvexRole(clerkMembership?.role ?? "org:member"),
    },
  );

  return {
    clerkUser,
    clerkMembership,
    clerkUserCreated,
    clerkMembershipCreated,
    convexUserId: accountResult.userId,
    convexMembershipId: membershipResult.membershipId,
    isSyntheticUser,
  };
}

function usage() {
  console.log(
    [
      "",
      "Legacy Migration Script",
      "",
      "Usage:",
      "  node scripts/migrate-legacy-laravel.mjs [--execute] [--with-photos] [--with-docs] [--allow-synthetic-users] [--account-strategy parent1|swap|graph]",
      "",
      "Environment variables (required):",
      "  LEGACY_DB_HOST, LEGACY_DB_USER, LEGACY_DB_PASSWORD",
      "  LEGACY_MIGRATION_SECRET",
      "  CLERK_SECRET_KEY",
      "  NEXT_PUBLIC_CONVEX_URL",
      "",
      "Environment variables (optional):",
      "  LEGACY_DB_PORT=3306",
      "  LEGACY_DB_NAME=main",
      "  LEGACY_FILTER_STATE=100",
      "  LEGACY_FILTER_CONTROL=665",
      "  LEGACY_SOURCE=laravel_mysql_legacy",
      "  TARGET_ORG_SLUG=cpca-sports",
      "  TENANCY_MODE=single|multi (default: single)",
      "  MIGRATION_ACTOR_EMAIL=<admin@...>",
      "  MIGRATION_ACTOR_CLERK_ID=user_...",
      "  LEGACY_FILES_ROOT=/path/to/legacy/public",
      "  LEGACY_FILES_BASE_URL=https://legacy.example.com/",
      "  LEGACY_ALLOW_SYNTHETIC_USERS=1",
      "",
      "Examples:",
      "  pnpm migrate:legacy:dry",
      "  pnpm migrate:legacy:execute -- --with-photos --with-docs --account-strategy swap",
      "",
    ].join("\n"),
  );
}

async function main() {
  await loadEnvFile(".env.local");
  await loadEnvFile(".env");

  const args = process.argv.slice(2);
  if (hasFlag(args, "--help")) {
    usage();
    return;
  }

  const dryRun = !hasFlag(args, "--execute");
  const includePhotos = hasFlag(args, "--with-photos");
  const includeDocs = hasFlag(args, "--with-docs");
  const allowSyntheticUsers =
    hasFlag(args, "--allow-synthetic-users") ||
    boolFromLegacy(process.env.LEGACY_ALLOW_SYNTHETIC_USERS);
  const accountStrategy = getArg(
    args,
    "--account-strategy",
    process.env.LEGACY_ACCOUNT_STRATEGY ?? "swap",
  );
  const tenancyModeRaw = normalizeSpaces(
    process.env.TENANCY_MODE ??
      process.env.NEXT_PUBLIC_TENANCY_MODE ??
      "single",
  ).toLowerCase();
  const singleTenantMode = tenancyModeRaw !== "multi";

  const config = {
    dryRun,
    includePhotos,
    includeDocs,
    allowSyntheticUsers,
    accountStrategy,
    singleTenantMode,
    legacyDbHost: process.env.LEGACY_DB_HOST,
    legacyDbPort: toNumber(process.env.LEGACY_DB_PORT ?? 3306, 3306),
    legacyDbUser: process.env.LEGACY_DB_USER,
    legacyDbPassword: process.env.LEGACY_DB_PASSWORD,
    legacyDbName: process.env.LEGACY_DB_NAME ?? "main",
    filterState: toNumber(process.env.LEGACY_FILTER_STATE ?? 100, 100),
    filterControl: toNumber(process.env.LEGACY_FILTER_CONTROL ?? 665, 665),
    source: process.env.LEGACY_SOURCE ?? "laravel_mysql_legacy",
    migrationSecret: process.env.LEGACY_MIGRATION_SECRET,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
    clerkSecretKey: process.env.CLERK_SECRET_KEY,
    targetOrgSlug: process.env.TARGET_ORG_SLUG ?? "cpca-sports",
    actorEmail: process.env.MIGRATION_ACTOR_EMAIL ?? null,
    actorClerkId: process.env.MIGRATION_ACTOR_CLERK_ID ?? null,
    filesRoot: process.env.LEGACY_FILES_ROOT ?? null,
    filesBaseUrl: process.env.LEGACY_FILES_BASE_URL ?? null,
  };

  const required = [
    ["LEGACY_DB_HOST", config.legacyDbHost],
    ["LEGACY_DB_USER", config.legacyDbUser],
    ["LEGACY_DB_PASSWORD", config.legacyDbPassword],
    ["LEGACY_MIGRATION_SECRET", config.migrationSecret],
    ["NEXT_PUBLIC_CONVEX_URL", config.convexUrl],
    ["CLERK_SECRET_KEY", config.clerkSecretKey],
  ];
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  if (
    (includePhotos || includeDocs) &&
    !config.filesRoot &&
    !config.filesBaseUrl
  ) {
    console.log(
      "[warn] --with-photos/--with-docs enabled without LEGACY_FILES_ROOT or LEGACY_FILES_BASE_URL. File upload will be skipped.",
    );
  }

  console.log(
    `[start] mode=${dryRun ? "dry-run" : "execute"} tenancy=${singleTenantMode ? "single" : "multi"} strategy=${accountStrategy} photos=${includePhotos} docs=${includeDocs} syntheticUsers=${allowSyntheticUsers}`,
  );

  const connection = await mysql.createConnection({
    host: config.legacyDbHost,
    port: config.legacyDbPort,
    user: config.legacyDbUser,
    password: config.legacyDbPassword,
    database: config.legacyDbName,
    dateStrings: true,
  });

  const [paramsRows] = await connection.query(
    "SELECT id, pt_id, name, description, value, code, p_state FROM params",
  );
  const [preRows] = await connection.query(
    "SELECT * FROM preadmissions WHERE p_state = ? AND p_control = ? ORDER BY id",
    [config.filterState, config.filterControl],
  );
  const [paymentRows] = await connection.query(
    `
      SELECT
        pay.*,
        svc.name AS service_name,
        svc.description AS service_description,
        method.name AS payment_method_name
      FROM payments pay
      JOIN preadmissions pre ON pre.id = pay.p_id
      LEFT JOIN params svc ON svc.id = pay.p_service
      LEFT JOIN params method ON method.id = pay.p_payment
      WHERE pre.p_state = ? AND pre.p_control = ? AND pay.p_state = 100
      ORDER BY pay.p_id, pay.id
    `,
    [config.filterState, config.filterControl],
  );
  const [docRows] = await connection.query(
    `
      SELECT
        doc.*,
        p.name AS document_name,
        p.description AS document_description
      FROM docs doc
      JOIN preadmissions pre ON pre.id = doc.p_id
      LEFT JOIN params p ON p.id = doc.p_document
      WHERE pre.p_state = ? AND pre.p_control = ? AND doc.p_state = 100
      ORDER BY doc.p_id, doc.id
    `,
    [config.filterState, config.filterControl],
  );
  await connection.end();

  const params = createParamHelpers(paramsRows);
  const countryResolver = createCountryResolver();

  const paymentsByApplication = new Map();
  for (const payment of paymentRows) {
    const key = Number(payment.p_id);
    const list = paymentsByApplication.get(key) ?? [];
    list.push(payment);
    paymentsByApplication.set(key, list);
  }

  const docsByApplication = new Map();
  for (const doc of docRows) {
    const key = Number(doc.p_id);
    const list = docsByApplication.get(key) ?? [];
    list.push(doc);
    docsByApplication.set(key, list);
  }

  const appToAccountKey = buildAccountAssignments(preRows, accountStrategy);
  const { accounts, appIdToAccount } = buildAccounts(preRows, appToAccountKey);

  let totalAmountCents = 0;
  let totalPaidCents = 0;
  let totalPendingCents = 0;
  for (const payment of paymentRows) {
    const amountCents = dollarsToCents(payment.amount);
    const paidRawCents = dollarsToCents(payment.due);
    const paidCents = Math.max(0, Math.min(amountCents, paidRawCents));
    const pendingCents = Math.max(0, amountCents - paidCents);
    totalAmountCents += amountCents;
    totalPaidCents += paidCents;
    totalPendingCents += pendingCents;
  }

  const docsWithUrl = docRows.filter((doc) => normalizeSpaces(doc.url));
  const photosWithPath = preRows.filter((pre) => normalizeSpaces(pre.picture));

  console.log(
    `[legacy] applications=${preRows.length} accounts=${accounts.length} payments=${paymentRows.length} docs=${docRows.length} docsWithUrl=${docsWithUrl.length} photosWithPath=${photosWithPath.length}`,
  );
  console.log(
    `[legacy] totalAmount=$${(totalAmountCents / 100).toFixed(2)} totalPending=$${(
      totalPendingCents / 100
    ).toFixed(2)} totalPaid=$${(totalPaidCents / 100).toFixed(2)}`,
  );

  const convex = new ConvexHttpClient(config.convexUrl);
  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });

  const organization = await convex.query(api.organizations.getBySlug, {
    slug: config.targetOrgSlug,
  });
  if (!organization) {
    throw new Error(`Organization slug "${config.targetOrgSlug}" not found`);
  }

  let formTemplateId = null;
  let formTemplateVersion = null;
  if (dryRun) {
    const templates = await convex.query(api.formTemplates.listByOrganization, {
      organizationId: organization._id,
    });
    if (templates.length > 0) {
      const preferred =
        templates.find((t) => t.isPublished) ??
        templates.reduce((latest, t) =>
          t.version > latest.version ? t : latest,
        );
      formTemplateId = preferred._id;
      formTemplateVersion = preferred.version;
    }
  } else {
    const template = await convex.mutation(
      api.legacyMigration.ensureFormTemplate,
      {
        secret: config.migrationSecret,
        organizationId: organization._id,
      },
    );
    formTemplateId = template.formTemplateId;
    formTemplateVersion = template.formTemplateVersion;
  }

  console.log(
    `[convex] organization=${organization.slug} formTemplateId=${formTemplateId ?? "none"} version=${formTemplateVersion ?? "n/a"}`,
  );

  const actor = await resolveActor({
    clerk,
    convex,
    organization,
    migrationSecret: config.migrationSecret,
    source: config.source,
    dryRun,
    singleTenantMode: config.singleTenantMode,
    explicitActorEmail: config.actorEmail,
    explicitActorClerkId: config.actorClerkId,
  });
  console.log(
    `[actor] clerkUserId=${actor.clerkUserId} email=${actor.email} convexUserId=${actor.convexUserId ?? "dry-run"}`,
  );

  const accountState = new Map();
  const failures = [];
  const metrics = {
    clerkUsersExisting: 0,
    clerkUsersCreated: 0,
    syntheticUsers: 0,
    clerkMembershipsExisting: 0,
    clerkMembershipsCreated: 0,
    applicationsCreated: 0,
    applicationsUpdated: 0,
    feesCreated: 0,
    feesUpdated: 0,
    transactionsCreated: 0,
    transactionsUpdated: 0,
    transactionsDeleted: 0,
    photosUploaded: 0,
    photosMissing: 0,
    docsUploaded: 0,
    docsMissing: 0,
  };

  for (let i = 0; i < accounts.length; i += 1) {
    const account = accounts[i];
    try {
      const result = await ensureAccount({
        account,
        clerk,
        convex,
        organization,
        migrationSecret: config.migrationSecret,
        source: config.source,
        dryRun,
        singleTenantMode: config.singleTenantMode,
        allowSyntheticUsers: config.allowSyntheticUsers,
      });

      if (result.clerkUser) metrics.clerkUsersExisting += 1;
      if (result.clerkUserCreated) metrics.clerkUsersCreated += 1;
      if (result.isSyntheticUser) metrics.syntheticUsers += 1;
      if (result.clerkMembership) metrics.clerkMembershipsExisting += 1;
      if (result.clerkMembershipCreated) metrics.clerkMembershipsCreated += 1;

      accountState.set(account.accountKey, {
        ...result,
        account,
      });
    } catch (error) {
      failures.push({
        preadmissionId: account.appIds[0] ?? -1,
        reason:
          error instanceof Error
            ? `account=${account.legacyAccountId} ${error.message}`
            : `account=${account.legacyAccountId} ${String(error)}`,
      });
    }

    if ((i + 1) % 25 === 0 || i + 1 === accounts.length) {
      console.log(`[accounts] processed ${i + 1}/${accounts.length}`);
    }
  }

  const fileCache = new Map();

  for (let i = 0; i < preRows.length; i += 1) {
    const pre = preRows[i];
    const appId = Number(pre.id);
    const account = appIdToAccount.get(appId);
    const state = account ? accountState.get(account.accountKey) : null;
    const paymentRowsForApp = paymentsByApplication.get(appId) ?? [];
    const paymentsPayload = buildPaymentsPayload(paymentRowsForApp);
    const status = mapApplicationStatus(
      pre.p_response,
      params.name(pre.p_response),
    );
    const formData = buildFormData(pre, params, countryResolver);

    if (!account) {
      failures.push({
        preadmissionId: appId,
        reason: "No account mapping found",
      });
      continue;
    }

    if (dryRun) {
      if ((i + 1) % 25 === 0 || i + 1 === preRows.length) {
        console.log(`[applications] planned ${i + 1}/${preRows.length}`);
      }
      continue;
    }

    if (!state?.convexUserId || !actor.convexUserId || !formTemplateId) {
      failures.push({
        preadmissionId: appId,
        reason: "Missing required Convex IDs for migration",
      });
      continue;
    }

    try {
      const result = await convex.mutation(
        api.legacyMigration.upsertApplicationWithPayments,
        {
          secret: config.migrationSecret,
          source: config.source,
          legacyApplicationId: String(appId),
          userId: state.convexUserId,
          actorUserId: actor.convexUserId,
          organizationId: organization._id,
          formTemplateId,
          formTemplateVersion,
          applicationCode: `LEG-${appId}-${normalizeSpaces(pre.code) || "no-code"}`,
          status,
          formData,
          ...(status !== "pending"
            ? {
                reviewedBy: actor.convexUserId,
                reviewedAt: parseTimestamp(pre.updated_at || pre.created_at),
              }
            : {}),
          payments: paymentsPayload,
        },
      );

      metrics.applicationsCreated += result.applicationCreated ? 1 : 0;
      metrics.applicationsUpdated += result.applicationUpdated ? 1 : 0;
      metrics.feesCreated += result.feesCreated;
      metrics.feesUpdated += result.feesUpdated;
      metrics.transactionsCreated += result.transactionsCreated;
      metrics.transactionsUpdated += result.transactionsUpdated;
      metrics.transactionsDeleted += result.transactionsDeleted;

      if (includePhotos && normalizeSpaces(pre.picture)) {
        const photoPath = normalizeSpaces(pre.picture);
        let storageId = fileCache.get(`photo:${photoPath}`) ?? null;

        if (!storageId) {
          const file = await readLegacyFile(photoPath, config);
          if (!file) {
            metrics.photosMissing += 1;
          } else {
            storageId = await uploadToConvexStorage(
              convex,
              file,
              config.migrationSecret,
            );
            fileCache.set(`photo:${photoPath}`, storageId);
            metrics.photosUploaded += 1;
          }
        }

        if (storageId) {
          await convex.mutation(api.legacyMigration.upsertApplicationPhoto, {
            secret: config.migrationSecret,
            source: config.source,
            legacyApplicationId: String(appId),
            applicationId: result.applicationId,
            storageId,
            legacyPicturePath: photoPath,
          });
        }
      }

      if (includeDocs) {
        const docsForApp = docsByApplication.get(appId) ?? [];
        for (const doc of docsForApp) {
          const relativePath = normalizeSpaces(doc.url);
          if (!relativePath) continue;

          const cacheKey = `doc:${relativePath}`;
          let storageId = fileCache.get(cacheKey) ?? null;

          if (!storageId) {
            const file = await readLegacyFile(relativePath, config);
            if (!file) {
              metrics.docsMissing += 1;
              continue;
            }
            storageId = await uploadToConvexStorage(
              convex,
              file,
              config.migrationSecret,
            );
            fileCache.set(cacheKey, storageId);
            metrics.docsUploaded += 1;
          }

          const documentTypeId =
            LEGACY_DOCUMENT_TYPE_MAP[Number(doc.p_document)] ??
            `legacy_doc_${Number(doc.p_document)}`;

          await convex.mutation(api.legacyMigration.upsertApplicationDocument, {
            secret: config.migrationSecret,
            source: config.source,
            legacyDocumentId: String(doc.id),
            applicationId: result.applicationId,
            actorUserId: actor.convexUserId,
            documentTypeId,
            name:
              normalizeSpaces(doc.document_name) ||
              `Legacy Document ${doc.p_document}`,
            ...(normalizeSpaces(doc.document_description)
              ? { description: normalizeSpaces(doc.document_description) }
              : {}),
            storageId,
            fileName: path.basename(relativePath),
            contentType: guessContentType(relativePath),
            fileSize: -1,
            uploadedAt: parseTimestamp(doc.updated_at || doc.created_at),
            isRequired: boolFromLegacy(doc.required),
          });
        }
      }
    } catch (error) {
      failures.push({
        preadmissionId: appId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    if ((i + 1) % 20 === 0 || i + 1 === preRows.length) {
      console.log(`[applications] processed ${i + 1}/${preRows.length}`);
    }
  }

  console.log("");
  console.log("Migration Summary");
  console.log("=================");
  console.log(`Mode: ${dryRun ? "dry-run" : "execute"}`);
  console.log(`Account strategy: ${accountStrategy}`);
  console.log(`Applications: ${preRows.length}`);
  console.log(`Accounts: ${accounts.length}`);
  console.log(`Payments rows: ${paymentRows.length}`);
  console.log(`Total amount: $${(totalAmountCents / 100).toFixed(2)}`);
  console.log(`Total pending: $${(totalPendingCents / 100).toFixed(2)}`);
  console.log(`Total paid: $${(totalPaidCents / 100).toFixed(2)}`);
  console.log(`Clerk users existing: ${metrics.clerkUsersExisting}`);
  console.log(`Clerk users created: ${metrics.clerkUsersCreated}`);
  console.log(`Synthetic users used: ${metrics.syntheticUsers}`);
  console.log(
    `Clerk memberships existing: ${metrics.clerkMembershipsExisting}`,
  );
  console.log(`Clerk memberships created: ${metrics.clerkMembershipsCreated}`);
  if (!dryRun) {
    console.log(`Applications created: ${metrics.applicationsCreated}`);
    console.log(`Applications updated: ${metrics.applicationsUpdated}`);
    console.log(`Fees created: ${metrics.feesCreated}`);
    console.log(`Fees updated: ${metrics.feesUpdated}`);
    console.log(`Transactions created: ${metrics.transactionsCreated}`);
    console.log(`Transactions updated: ${metrics.transactionsUpdated}`);
    console.log(`Transactions deleted: ${metrics.transactionsDeleted}`);
    if (includePhotos) {
      console.log(`Photos uploaded: ${metrics.photosUploaded}`);
      console.log(`Photos missing: ${metrics.photosMissing}`);
    }
    if (includeDocs) {
      console.log(`Documents uploaded: ${metrics.docsUploaded}`);
      console.log(`Documents missing: ${metrics.docsMissing}`);
    }
  }

  if (failures.length > 0) {
    console.log(`Failures: ${failures.length}`);
    for (const failure of failures.slice(0, 20)) {
      console.log(
        `- preadmission=${failure.preadmissionId} reason=${failure.reason}`,
      );
    }
    if (failures.length > 20) {
      console.log(`- ... ${failures.length - 20} more`);
    }
    process.exitCode = 1;
  } else {
    console.log("Failures: 0");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
