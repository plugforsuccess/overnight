import { execSync } from "child_process";

const steps = [
  { name: "Preflight checks", cmd: "npm run preflight" },
  { name: "Route hardening audit", cmd: "npm run audit:routes" },
  { name: "Smoke test", cmd: "npm run smoke-test" },
  { name: "Capacity reconciliation", cmd: "npm run ops:capacity-check" },
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  try {
    execSync(step.cmd, { stdio: "inherit" });
  } catch {
    console.error(`\n❌ Launch check failed at: ${step.name}`);
    process.exit(1);
  }
}

console.log("\n✅ Launch check complete. System safe to deploy.");
