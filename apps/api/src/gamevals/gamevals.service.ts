import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAMEVAL_KINDS,
  type GamevalKind,
  type GamevalTable,
  emptyGamevalTable,
  parseGamevalFile,
} from './gamevals.catalog';

/**
 * Loads `data/gamevals/<kind>.json` once at boot and serves id <-> name
 * lookups from memory. All tables together are ~28k rows, so there is no DB
 * involvement: replacing the JSON files and restarting is the whole update
 * story. Override the directory with GAMEVALS_DIR. Not exposed over HTTP.
 *
 * A missing or unparseable file logs a warning and yields an empty table so
 * the API still boots; lookups for that kind then simply return undefined.
 */
@Injectable()
export class GamevalsService implements OnModuleInit {
  private readonly logger = new Logger(GamevalsService.name);
  private readonly tables = new Map<GamevalKind, GamevalTable>();

  constructor() {
    for (const kind of GAMEVAL_KINDS) {
      this.tables.set(kind, emptyGamevalTable(kind));
    }
  }

  onModuleInit() {
    this.loadAll(
      process.env.GAMEVALS_DIR?.trim() ||
        join(process.cwd(), 'data', 'gamevals'),
    );
  }

  /** Load every known kind from `dir`. Exposed so tests can point at fixtures. */
  loadAll(dir: string) {
    for (const kind of GAMEVAL_KINDS) {
      const path = join(dir, `${kind}.json`);
      if (!existsSync(path)) {
        this.logger.warn(`gameval ${kind}: ${path} missing, lookups disabled`);
        this.tables.set(kind, emptyGamevalTable(kind));
        continue;
      }
      try {
        const table = parseGamevalFile(
          kind,
          JSON.parse(readFileSync(path, 'utf8')),
        );
        this.tables.set(kind, table);
        this.logger.log(
          `gameval ${kind}: ${table.idToName.size} entries (rev ${table.revision})`,
        );
      } catch (err) {
        this.logger.error(`gameval ${kind}: failed to load ${path}`, err);
        this.tables.set(kind, emptyGamevalTable(kind));
      }
    }
  }

  table(kind: GamevalKind): GamevalTable {
    return this.tables.get(kind) ?? emptyGamevalTable(kind);
  }

  revision(kind: GamevalKind): number {
    return this.table(kind).revision;
  }

  nameOf(kind: GamevalKind, id: number): string | undefined {
    return this.table(kind).idToName.get(id);
  }

  idOf(kind: GamevalKind, name: string): number | undefined {
    return this.table(kind).nameToId.get(name);
  }

  hasName(kind: GamevalKind, name: string): boolean {
    return this.table(kind).nameToId.has(name);
  }
}
