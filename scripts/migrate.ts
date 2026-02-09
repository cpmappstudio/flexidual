// scripts/migrate.ts
import { ConvexHttpClient } from "convex/browser";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import JSON5 from "json5";

// Load environment variables
dotenv.config({ path: ".env.local" });

// CHECK: Ensure the URL exists before creating the client
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL;

if (!convexUrl) {
  console.error("❌ Error: NEXT_PUBLIC_CONVEX_URL is missing from .env.local");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

// ... rest of your types ...
type OldCurriculum = {
  _id: string; // Use string for source data to avoid type mismatches
  name: string;
  createdAt: number;
  isActive: boolean;
};

type OldLesson = {
  _id: string;
  curriculumId: string;
  title: string;
  description?: string;
  quarter: number;
  orderInQuarter: number;
  isActive: boolean;
  createdAt: number;
};

async function main() {
  console.log(`🚀 Starting Migration to: ${convexUrl}`);

  // 1. Load Data
  const curriculumsRaw = JSON5.parse(fs.readFileSync(path.join(__dirname, "data/curriculums.json"), "utf8"));
  const lessonsRaw = JSON5.parse(fs.readFileSync(path.join(__dirname, "data/lessons.json"), "utf8"));

  console.log(`📦 Loaded ${curriculumsRaw.length} curriculums and ${lessonsRaw.length} lessons.`);

  // Map to store Old_ID -> New_ID
  const curriculumIdMap = new Map<string, Id<"curriculums">>();

  // 2. Migrate Curriculums
  console.log("\n--- Processing Curriculums ---");
  for (const oldCurr of curriculumsRaw as OldCurriculum[]) {
    try {
      // Map Old Name -> New Title & Code
      const code = oldCurr.name.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 10);
      
      const newId = await client.mutation(api.migration.importCurriculum, {
        title: oldCurr.name,
        description: `Imported from legacy system.`, 
        code: code,
        isActive: oldCurr.isActive,
        createdAt: oldCurr.createdAt,
      });

      curriculumIdMap.set(oldCurr._id, newId);
      process.stdout.write("."); 
    } catch (e) {
      console.error(`\n❌ Failed to import ${oldCurr.name}:`, e);
    }
  }
  console.log(`\n✅ Imported ${curriculumIdMap.size} Curriculums.`);

  // 3. Migrate Lessons
  console.log("\n--- Processing Lessons ---");
  
  // Group lessons by Old Curriculum ID
  const lessonsByCurriculum = new Map<string, OldLesson[]>();
  
  for (const lesson of lessonsRaw as OldLesson[]) {
    if (!lessonsByCurriculum.has(lesson.curriculumId)) {
      lessonsByCurriculum.set(lesson.curriculumId, []);
    }
    lessonsByCurriculum.get(lesson.curriculumId)!.push(lesson);
  }

  // Iterate through *Migrated* Curriculums only
  for (const [oldCurrId, newCurrId] of curriculumIdMap.entries()) {
    const oldLessons = lessonsByCurriculum.get(oldCurrId);
    
    if (!oldLessons || oldLessons.length === 0) continue;

    // SORTING MAGIC: Convert Quarter/Order -> Linear Order
    oldLessons.sort((a, b) => {
      if (a.quarter !== b.quarter) return a.quarter - b.quarter;
      return a.orderInQuarter - b.orderInQuarter;
    });

    const CHUNK_SIZE = 100;
    for (let i = 0; i < oldLessons.length; i += CHUNK_SIZE) {
      const chunk = oldLessons.slice(i, i + CHUNK_SIZE);
      
      const formattedChunk = chunk.map(l => ({
        title: l.title,
        description: l.description,
        content: undefined,
        isActive: l.isActive,
        createdAt: l.createdAt,
      }));

      try {
        await client.mutation(api.migration.importLessonsBatch, {
          curriculumId: newCurrId,
          lessons: formattedChunk,
        });
        process.stdout.write("+");
      } catch (e) {
        console.error(`\n❌ Error batching lessons for curriculum ${oldCurrId}:`, e);
      }
    }
  }

  console.log("\n\n✨ Migration Complete!");
}

main().catch(console.error);