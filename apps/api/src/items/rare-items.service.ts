import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The item ids worth announcing when one drops, read from
 * `data/rare-items.json` at boot. Keeping the list here rather than in the
 * plugin means it can be corrected without shipping a client build: plugins
 * fetch it on login, and every report is re-checked against it anyway.
 *
 * Override the file with RARE_ITEMS_FILE. A missing or broken file logs and
 * yields an empty list, which simply records nothing.
 */
@Injectable()
export class RareItemsService implements OnModuleInit {
  private readonly logger = new Logger(RareItemsService.name);
  private ids: ReadonlySet<number> = new Set();
  private updated = '';

  onModuleInit() {
    this.load(
      process.env.RARE_ITEMS_FILE?.trim() ||
        join(process.cwd(), 'data', 'rare-items.json'),
    );
  }

  /** Exposed so tests can point at a fixture. */
  load(path: string) {
    if (!existsSync(path)) {
      this.logger.warn(`rare items: ${path} missing, nothing will be flagged`);
      this.ids = new Set();
      return;
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
      const body = raw as { ids?: unknown; updated?: unknown };
      const list = Array.isArray(body.ids) ? body.ids : [];
      const ids = new Set<number>();
      for (const entry of list) {
        const id = Number(entry);
        if (Number.isInteger(id) && id > 0) ids.add(id);
      }
      this.ids = ids;
      this.updated = typeof body.updated === 'string' ? body.updated : '';
      this.logger.log(`rare items: ${ids.size} ids (updated ${this.updated || 'unknown'})`);
    } catch (err) {
      this.logger.error(`rare items: failed to load ${path}`, err);
      this.ids = new Set();
    }
  }

  has(itemId: number): boolean {
    return this.ids.has(itemId);
  }

  list(): number[] {
    return [...this.ids].sort((a, b) => a - b);
  }

  get count(): number {
    return this.ids.size;
  }

  get updatedAt(): string {
    return this.updated;
  }
}
