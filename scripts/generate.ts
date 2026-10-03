import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_FILES, buildScenarios, serializeScenario } from "../src/sim/scenarios";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(dir, { recursive: true });
buildScenarios().forEach((s, i) => {
  const file = join(dir, FIXTURE_FILES[i]);
  writeFileSync(file, serializeScenario(s));
  console.log(`wrote ${file} (${s.runs.length} runs)`);
});
