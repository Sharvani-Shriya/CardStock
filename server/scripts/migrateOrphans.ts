#!/usr/bin/env node
/**
 * npm run migrate:orphans [-- --assign-to <email> | -- --delete]
 *
 * Handles columns and cards that have no owner (userId is null/missing),
 * which can exist if the database was used before authentication was added.
 *
 * Modes
 * -----
 *   (no flag)              Print a count of orphaned columns and cards.  Safe,
 *                          read-only.  Run this first to understand the impact.
 *
 *   --assign-to <email>    Assign all orphaned documents to the given user.
 *                          The user must already exist in the database.
 *
 *   --delete               Permanently delete all orphaned columns and cards.
 *                          Orphaned cards are deleted first, then columns.
 *
 * Examples
 * --------
 *   npm run migrate:orphans
 *   npm run migrate:orphans -- --assign-to alice@example.com
 *   npm run migrate:orphans -- --delete
 */

import "dotenv/config";
import mongoose from "mongoose";
import { Card } from "../src/models/Card.js";
import { Column } from "../src/models/Column.js";
import { User } from "../src/models/User.js";

// Top-level await is not supported with "module": "Node16" in .ts files, so
// all async work is wrapped in main() and called at the bottom.
async function main(): Promise<void> {
  // Parse CLI flags --------------------------------------------------------

  const args = process.argv.slice(2);
  const assignToIndex = args.indexOf("--assign-to");
  const shouldDelete = args.includes("--delete");
  const assignToEmail = assignToIndex !== -1 ? args[assignToIndex + 1] : undefined;

  if (shouldDelete && assignToEmail) {
    console.error("Error: --assign-to and --delete are mutually exclusive.");
    process.exit(1);
  }

  if (assignToIndex !== -1 && !assignToEmail) {
    console.error("Error: --assign-to requires an email argument.");
    process.exit(1);
  }

  // Connect to MongoDB -----------------------------------------------------

  const MONGODB_URI = process.env["MONGODB_URI"];
  if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  // The orphan filter: documents where userId is missing or null.
  // Documents written before auth was added will not have the field at all.
  const orphanFilter = { $or: [{ userId: null }, { userId: { $exists: false } }] };

  const orphanedColumns = await Column.countDocuments(orphanFilter);
  const orphanedCards = await Card.countDocuments(orphanFilter);

  console.log(`Orphaned columns: ${String(orphanedColumns)}`);
  console.log(`Orphaned cards:   ${String(orphanedCards)}`);

  if (orphanedColumns === 0 && orphanedCards === 0) {
    console.log("No orphaned documents found. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // ── Assign mode ----------------------------------------------------------

  if (assignToEmail) {
    const normalised = assignToEmail.toLowerCase().trim();
    const user = await User.findOne({ email: normalised });
    if (!user) {
      console.error(`Error: No user found with email "${normalised}".`);
      await mongoose.disconnect();
      process.exit(1);
    }

    const userId = user._id;

    const colResult = await Column.updateMany(orphanFilter, { $set: { userId } });
    const cardResult = await Card.updateMany(orphanFilter, { $set: { userId } });

    console.log(
      `Assigned ${String(colResult.modifiedCount)} columns and ` +
        `${String(cardResult.modifiedCount)} cards to ${normalised}.`,
    );
  }

  // ── Delete mode ----------------------------------------------------------

  if (shouldDelete) {
    // Delete cards first so we don't leave orphaned cards pointing at columns
    // that are about to disappear.
    const cardResult = await Card.deleteMany(orphanFilter);
    const colResult = await Column.deleteMany(orphanFilter);

    console.log(
      `Deleted ${String(cardResult.deletedCount)} orphaned cards and ` +
        `${String(colResult.deletedCount)} orphaned columns.`,
    );
  }

  // ── Dry-run (no flag) — already printed counts above -------------------

  if (!assignToEmail && !shouldDelete) {
    console.log(
      "Run with --assign-to <email> to assign them, or --delete to remove them.",
    );
  }

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
