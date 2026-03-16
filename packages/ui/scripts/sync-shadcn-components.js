#!/usr/bin/env node

/**
 * Shadcn-Vue Component Sync Script
 *
 * Usage:
 *   node scripts/sync-shadcn-components.js                    # Sync all syncable components
 *   node scripts/sync-shadcn-components.js --dry-run         # Preview components to sync
 *   node scripts/sync-shadcn-components.js --check           # Check only, fail if changes needed
 *   node scripts/sync-shadcn-components.js button card       # Sync specific components
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_DIR = path.join(__dirname, "..");
const UI_DIR = path.join(APP_DIR, "src/components");

const doNotSyncComponents = new Set();
let upstreamComponents = [];

/**
 * Fetch upstream component list dynamically
 */
async function fetchUpstreamComponents() {
  console.log("\n📡 Fetching upstream component list...\n");

  const localComponents = fs.readdirSync(UI_DIR).filter((component) => {
    const componentDir = path.join(UI_DIR, component);
    return fs.statSync(componentDir).isDirectory();
  });

  const availableComponents = [];

  for (const component of localComponents) {
    try {
      const cmd = `curl -s -o /dev/null -w "%{http_code}" "https://shadcn-vue.com/r/styles/new-york/${component}.json"`;
      const statusCode = execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 3000,
      }).trim();

      if (statusCode === "200") {
        availableComponents.push(component);
      }
    } catch (error) {
      // Component not available or timeout
    }
  }

  upstreamComponents = availableComponents;
  console.log(
    `✅ Found ${availableComponents.length} components in upstream registry`,
  );
  return availableComponents;
}

/**
 * Check for abandoned components
 */
function checkAbandonedComponents() {
  const localComponents = fs.readdirSync(UI_DIR).filter((component) => {
    const componentDir = path.join(UI_DIR, component);
    return fs.statSync(componentDir).isDirectory();
  });

  const abandonedComponents = [];

  for (const component of localComponents) {
    if (!upstreamComponents.includes(component)) {
      const indexPath = path.join(UI_DIR, component, "index.ts");
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, "utf-8");
        if (!content.includes("@shadcn-custom-component")) {
          abandonedComponents.push(component);
        }
      }
    }
  }

  return abandonedComponents;
}

/**
 * Scan for do-not-sync components
 */
function scanDoNotSyncComponents() {
  const components = fs.readdirSync(UI_DIR);

  for (const component of components) {
    const componentDir = path.join(UI_DIR, component);
    const indexPath = path.join(componentDir, "index.ts");

    if (!fs.statSync(componentDir).isDirectory() || !fs.existsSync(indexPath)) {
      continue;
    }

    const content = fs.readFileSync(indexPath, "utf-8");

    if (content.includes("@shadcn-do-not-sync")) {
      doNotSyncComponents.add(component);
      console.log(`⚠️  Skipping ${component} (marked as do-not-sync)`);
    }
  }
}

/**
 * Check if component can be synced
 */
function canSyncComponent(componentName) {
  if (doNotSyncComponents.has(componentName)) {
    return false;
  }
  return true;
}

/**
 * Sync a single component
 */
function syncComponent(componentName, dryRun = false) {
  console.log(`\n🔄 Syncing ${componentName}...`);

  if (dryRun) {
    console.log(
      `   [DRY RUN] Would execute: pnpx shadcn-vue@latest add ${componentName} --overwrite --yes`,
    );
    return true;
  }

  try {
    const cmd = `pnpx shadcn-vue@latest add ${componentName} --overwrite --yes`;
    execSync(cmd, {
      cwd: APP_DIR,
      stdio: "pipe",
      encoding: "utf-8",
    });
    console.log(`✅ ${componentName} synced successfully`);
    return true;
  } catch (error) {
    console.error(`❌ ${componentName} sync failed:`, error.message);
    return false;
  }
}

/**
 * Get all syncable components
 */
function getSyncableComponents() {
  const components = fs.readdirSync(UI_DIR);
  const syncable = [];

  for (const component of components) {
    const componentDir = path.join(UI_DIR, component);

    if (!fs.statSync(componentDir).isDirectory()) {
      continue;
    }

    if (canSyncComponent(component)) {
      syncable.push(component);
    }
  }

  return syncable;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const checkMode = args.includes("--check");
  const specificComponents = args.filter((arg) => !arg.startsWith("--"));

  console.log("🔍 Shadcn-Vue Component Sync Tool\n");
  console.log("=".repeat(60));

  // Fetch upstream components
  await fetchUpstreamComponents();

  // Scan for do-not-sync components
  console.log("\n📋 Scanning component annotations...\n");
  scanDoNotSyncComponents();

  console.log(
    `\n📊 Found ${doNotSyncComponents.size} component(s) marked as do-not-sync:`,
  );
  if (doNotSyncComponents.size > 0) {
    Array.from(doNotSyncComponents).forEach((c) => {
      console.log(`   - ${c}`);
    });
  } else {
    console.log("   (none)");
  }

  // Check for abandoned components
  console.log("\n🔍 Checking for abandoned components...");
  const abandonedComponents = checkAbandonedComponents();
  if (abandonedComponents.length > 0) {
    console.log(
      `\n⚠️  WARNING: Found ${abandonedComponents.length} component(s) that may be abandoned by upstream:`,
    );
    abandonedComponents.forEach((c) => {
      console.log(`   - ${c} (not found in upstream registry)`);
    });
    console.log(
      "\n💡 These components might have been renamed or removed. Please review and consider removing them.\n",
    );
  } else {
    console.log("✅ No abandoned components detected\n");
  }

  // Check mode
  if (checkMode) {
    console.log("\n" + "=".repeat(60));
    console.log("\n📋 CHECK MODE - Reporting only, no changes will be made\n");

    let hasIssues = false;

    if (abandonedComponents.length > 0) {
      console.log("❌ Abandoned components found (see above)");
      hasIssues = true;
    }

    const componentsToCheck =
      specificComponents.length > 0
        ? specificComponents
        : getSyncableComponents().filter((c) => !doNotSyncComponents.has(c));

    if (componentsToCheck.length > 0) {
      console.log(
        `\n📦 ${componentsToCheck.length} component(s) can be synced:`,
      );
      componentsToCheck.forEach((c) => {
        console.log(`   - ${c}`);
      });
      console.log("\n💡 Run without --check to sync these components");
      hasIssues = true;
    } else {
      console.log("\n✅ All components are up to date");
    }

    console.log("\n" + "=".repeat(60) + "\n");

    if (hasIssues) {
      console.log("❌ Check failed - changes needed");
      process.exit(1);
    } else {
      console.log("✅ Check passed - no changes needed");
      process.exit(0);
    }

    return;
  }

  // Determine components to sync
  let componentsToSync = [];

  if (specificComponents.length > 0) {
    console.log(
      `\n🎯 Specified components to sync: ${specificComponents.join(", ")}`,
    );
    componentsToSync = specificComponents;
  } else {
    console.log("\n🎯 Preparing to sync all syncable components...");
    componentsToSync = getSyncableComponents();
  }

  // Filter
  componentsToSync = componentsToSync.filter(
    (c) => !doNotSyncComponents.has(c),
  );
  componentsToSync = componentsToSync.filter(
    (c) => !abandonedComponents.includes(c),
  );

  console.log(`\n📦 Will sync ${componentsToSync.length} component(s):`);
  componentsToSync.forEach((c) => {
    console.log(`   - ${c}`);
  });

  if (abandonedComponents.length > 0) {
    console.log(
      `\n⚠️  Skipping ${abandonedComponents.length} abandoned component(s):`,
    );
    abandonedComponents.forEach((c) => {
      console.log(`   - ${c}`);
    });
  }

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n🚀 Starting sync...\n");

  let successCount = 0;
  let failCount = 0;

  for (const component of componentsToSync) {
    if (syncComponent(component, dryRun)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 Sync completed!\n");
  console.log(`✅ Success: ${successCount} component(s)`);
  if (failCount > 0) {
    console.log(`❌ Failed: ${failCount} component(s)`);
  }

  console.log("=".repeat(60) + "\n");
}

main();
