import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: number; name: string; icao: string; iata: string | null };

const mocks = vi.hoisted(() => ({ rows: [] as Row[] }));

// A table of airlines behind the query chains the code lookups use: a case-
// insensitive exact match on one column, as `ilike` without wildcards is.
vi.mock('$lib/db', () => ({
  db: {
    selectFrom: () => ({
      selectAll: () => ({
        where: (column: 'icao' | 'iata', _op: string, value: string) => {
          const matches = () =>
            mocks.rows.filter(
              (row) => row[column]?.toLowerCase() === value.toLowerCase(),
            );
          return {
            executeTakeFirst: async () => matches()[0],
            limit: (n: number) => ({
              execute: async () => matches().slice(0, n),
            }),
          };
        },
      }),
    }),
  },
}));

vi.mock('$lib/server/utils/uploads', () => ({ uploadManager: {} }));

const { getAirlineByCode } = await import('./airline');

beforeEach(() => {
  mocks.rows = [
    { id: 1, name: 'Qantas', icao: 'QFA', iata: 'QF' },
    { id: 2, name: 'Alaska Airlines', icao: 'ASA', iata: 'AS' },
    // The database can hold a second airline with the same plain code.
    { id: 3, name: 'AlphaSky', icao: 'JAG', iata: 'AS' },
    // A secondary holder stored with an asterisk, as data/airlines.json has it.
    { id: 4, name: 'Star Air', icao: 'SDG', iata: 'S5*' },
  ];
});

describe('getAirlineByCode', () => {
  it('finds an airline by its ICAO code', async () => {
    expect(await getAirlineByCode('QFA')).toMatchObject({ name: 'Qantas' });
  });

  it('finds an airline by an IATA code that one airline holds', async () => {
    expect(await getAirlineByCode('QF')).toMatchObject({ name: 'Qantas' });
  });

  it('refuses an IATA code that several airlines hold, without picking one', async () => {
    expect(await getAirlineByCode('AS')).toBe('ambiguous');
  });

  it('prefers an ICAO match over an IATA match, so ICAO clients see no change', async () => {
    mocks.rows.push({ id: 5, name: 'Custom QF', icao: 'QF', iata: null });
    expect(await getAirlineByCode('QF')).toMatchObject({ name: 'Custom QF' });
  });

  it('does not match a code stored with an asterisk', async () => {
    expect(await getAirlineByCode('S5')).toBeNull();
  });

  it('returns null for an unknown code', async () => {
    expect(await getAirlineByCode('ZZ')).toBeNull();
    expect(await getAirlineByCode('ZZZ')).toBeNull();
  });
});
