#!/usr/bin/env node
/**
 * npm run migrate:orphans [-- --assign-to <email> | -- --delete]
 *
 * Handles columns and cards that have no owner (userId is null/missing),
 * which can exist if the database was used before authentication was added.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { Card } from "../src/models/Card.js";
import { Column } from "../src/models/Column.js";
import { User } from "../src/models/User.js";

export interface MigrationOptions {
  assignToEmail?: string;
  shouldDelete?: boolean;
  silent?: boolean;
}

export interface MigrationResult {
  orphanedColumns: number;
  orphanedCards: number;
  assignedColumns?: number;
  assignedCards?: number;
  deletedColumns?: number;
  deletedCards?: number;
}

export async function runOrphanMigration(options: MigrationOptions = {}): Promise<MigrationResult> {
  const { assignToEmail, shouldDelete, silent = false } = options;
  const orphanFilter = { $or: [{ userId: null }, { userId: { $exists: false } }] };

  const orphanedColumns = await Column.countDocuments(orphanFilter);
  const orphanedCards = await Card.countDocuments(orphanFilter);

  if (!silent) {
    console.log(`Orphaned columns: ${String(orphanedColumns)}`);
    console.log(`Orphaned cards:   ${String(orphanedCards)}`);
  }

  if (orphanedColumns === 0 && orphanedCards === 0) {
    if (!silent) console.log("No orphaned documents found. Nothing to do.");
    return { orphanedColumns: 0, orphanedCards: 0 };
  }

  if (assignToEmail) {
    const normalised = assignToEmail.toLowerCase().trim();
    const user = await User.findOne({ email: normalised });
    if (!user) {
      throw new Error(`No user found with email "${normalised}".`);
    }

    const userId = user._id;
    const colResult = await Column.updateMany(orphanFilter, { $set: { userId } });
    const cardResult = await Card.updateMany(orphanFilter, { $set: { userId } });

    if (!silent) {
      console.log(
        `Assigned ${String(colResult.modifiedCount)} columns and ` +
          `${String(cardResult.modifiedCount)} cards to ${normalised}.`,
      );
    }
    return {
      orphanedColumns,
      orphanedCards,
      assignedColumns: colResult.modifiedCount,
      assignedCards: cardResult.modifiedCount,
    };
  }

  if (shouldDelete) {
    const cardResult = await Card.deleteMany(orphanFilter);
    const colResult = await Column.deleteMany(orphanFilter);

    if (!silent) {
      console.log(
        `Deleted ${String(cardResult.deletedCount)} orphaned cards and ` +
          `${String(colResult.deletedCount)} orphaned columns.`,
      );
    }
    return {
      orphanedColumns,
      orphanedCards,
      deletedColumns: colResult.deletedCount,
      deletedCards: cardResult.deletedCount,
    };
  }

  // Dry run (no flags)
  if (!silent) {
    console.log("Run with --assign-to <email> to assign them, or --delete to remove them.");
  }
  return { orphanedColumns, orphanedCards };
}

async function main(): Promise<void> {
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

  const MONGODB_URI = process.env["MONGODB_URI"];
  if (!MONGODB_URI) {
    console.error("Error: MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  try {
    await runOrphanMigration({ assignToEmail, shouldDelete });
  } finally {
    await mongoose.disconnect();
  }
}

// Only invoke CLI runner if executed directly
if (process.argv[1] && process.argv[1].endsWith("migrateOrphans.ts")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
