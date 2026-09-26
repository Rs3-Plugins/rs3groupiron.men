import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACHIEVEMENT_KIND_TO_GAMEVAL,
  gamevalDedupeKey,
  isGamevalKind,
  isGamevalName,
  parseGamevalFile,
} from './gamevals.catalog';
import { GamevalsService } from './gamevals.service';

describe('parseGamevalFile', () => {
  it('builds both directions and keeps the revision', () => {
    const table = parseGamevalFile('quest', {
      revision: 949,
      entries: { '0': 'cabinfever', '1': 'tower_of_life' },
    });
    expect(table.revision).toBe(949);
    expect(table.idToName.get(1)).toBe('tower_of_life');
    expect(table.nameToId.get('cabinfever')).toBe(0);
  });

  it('skips malformed ids and names instead of failing the file', () => {
    const table = parseGamevalFile('inv', {
      revision: 1,
      entries: {
        abc: 'axeshop',
        '2': '',
        '3': 'Has Spaces',
        '4': 'generalshop1',
        '5': 42 as unknown as string,
      },
    });
    expect([...table.idToName.entries()]).toEqual([[4, 'generalshop1']]);
  });

  it('resolves a duplicated name to the lowest id', () => {
    const table = parseGamevalFile('achievement', {
      revision: 1,
      entries: { '10': 'dup', '3': 'dup' },
    });
    expect(table.nameToId.get('dup')).toBe(3);
    expect(table.idToName.size).toBe(2);
  });

  it('defaults an absent revision to 0', () => {
    expect(parseGamevalFile('quest', { entries: {} }).revision).toBe(0);
  });

  it('rejects files without an entries object', () => {
    expect(() => parseGamevalFile('quest', { revision: 1 })).toThrow(/entries/);
    expect(() => parseGamevalFile('quest', null)).toThrow(/JSON object/);
  });
});

describe('gameval helpers', () => {
  it('recognises the supported kinds only', () => {
    expect(isGamevalKind('quest')).toBe(true);
    expect(isGamevalKind('var_player')).toBe(true);
    expect(isGamevalKind('var_clan_setting')).toBe(true);
    expect(isGamevalKind('obj')).toBe(false);
  });

  it('accepts snake_case names and rejects anything else', () => {
    expect(isGamevalName('quest_cooks_assistant')).toBe(true);
    expect(isGamevalName('Cooks Assistant')).toBe(false);
    expect(isGamevalName('')).toBe(false);
  });

  it('maps achievement kinds onto gameval tables', () => {
    expect(ACHIEVEMENT_KIND_TO_GAMEVAL.quest).toBe('quest');
    expect(ACHIEVEMENT_KIND_TO_GAMEVAL.diary).toBe('achievement');
    expect(ACHIEVEMENT_KIND_TO_GAMEVAL.level).toBeUndefined();
    expect(ACHIEVEMENT_KIND_TO_GAMEVAL.drop).toBeUndefined();
  });

  it('keys dedupe on the name, never the id', () => {
    expect(gamevalDedupeKey('IronMayo', 'quest', 'cabinfever')).toBe(
      'gameval:IronMayo:quest:cabinfever',
    );
  });
});

describe('GamevalsService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamevals-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads present files and leaves missing kinds empty', () => {
    writeFileSync(
      join(dir, 'quest.json'),
      JSON.stringify({
        revision: 949,
        entries: { '12': 'quest_cooks_assistant' },
      }),
    );
    const service = new GamevalsService();
    service.loadAll(dir);

    expect(service.nameOf('quest', 12)).toBe('quest_cooks_assistant');
    expect(service.idOf('quest', 'quest_cooks_assistant')).toBe(12);
    expect(service.revision('quest')).toBe(949);

    expect(service.nameOf('achievement', 1)).toBeUndefined();
    expect(service.revision('inv')).toBe(0);
  });

  it('survives an unparseable file', () => {
    writeFileSync(join(dir, 'inv.json'), '{not json');
    const service = new GamevalsService();
    expect(() => service.loadAll(dir)).not.toThrow();
    expect(service.hasName('inv', 'axeshop')).toBe(false);
  });
});
