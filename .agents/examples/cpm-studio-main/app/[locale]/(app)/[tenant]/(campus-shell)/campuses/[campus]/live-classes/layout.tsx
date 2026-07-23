import {
  createCampusModuleGuardLayout,
  getModuleManifestOrThrow,
} from "@/app/[locale]/(app)/[tenant]/(shell)/_lib/module-layout";

const manifest = getModuleManifestOrThrow("liveClasses");

export default createCampusModuleGuardLayout(manifest);
