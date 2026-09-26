import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type QuestCatalogEntry,
  humanizeGameval,
  parseQuestCatalog,
} from './quest-catalog';

/**
 * In-memory quest metadata loaded once at boot from `data/quests.json`
 * (override with QUESTS_FILE). Missing or broken file leaves the catalog
 * empty; titles then fall back to a humanised gameval.
 */
@Injectable()
export class QuestCatalogService implements OnModuleInit {
  private readonly logger = new Logger(QuestCatalogService.name);
  private entries: ReadonlyMap<string, QuestCatalogEntry> = new Map();

  onModuleInit() {
    this.load(
      process.env.QUESTS_FILE?.trim() ||
        join(process.cwd(), 'data', 'quests.json'),
    );
  }

  load(path: string) {
    if (!existsSync(path)) {
      this.logger.warn(`quests: ${path} missing, titles fall back to gamevals`);
      this.entries = new Map();
      return;
    }
    try {
      this.entries = parseQuestCatalog(JSON.parse(readFileSync(path, 'utf8')));
      this.logger.log(`quests: ${this.entries.size} entries`);
    } catch (err) {
      this.logger.error(`quests: failed to load ${path}`, err);
      this.entries = new Map();
    }
  }

  get(gameval: string): QuestCatalogEntry | undefined {
    return this.entries.get(gameval);
  }

  /** Display name, or a readable version of the gameval when unknown. */
  nameOf(gameval: string): string {
    return this.entries.get(gameval)?.name ?? humanizeGameval(gameval);
  }

  size(): number {
    return this.entries.size;
  }
}
