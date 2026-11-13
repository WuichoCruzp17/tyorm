import {
    describe,
    expect,
    it
} from 'vitest';

import {
    JunctionAliasGenerator
} from '../src/query/semantic/junction-alias-generator';

describe('JunctionAliasGenerator', () => {

    it('generates unique aliases', () => {
        const generator = new JunctionAliasGenerator(
            new Set(['u', 'r'])
        );

        expect(generator.generate())
            .toBe('__tyorm_junction_0');

        expect(generator.generate())
            .toBe('__tyorm_junction_1');
    });

    it('avoids reserved aliases', () => {
        const generator = new JunctionAliasGenerator(
            new Set([
                'u',
                '__tyorm_junction_0',
                '__tyorm_junction_1'
            ])
        );

        expect(generator.generate())
            .toBe('__tyorm_junction_2');
    });

    it('rejects duplicate reservations', () => {
        const generator = new JunctionAliasGenerator(
            new Set(['u'])
        );

        expect(() =>
            generator.reserve('u')
        ).toThrow(/Duplicate query alias/);
    });

    it('reserves generated aliases', () => {
        const reserved = new Set<string>();

        const generator = new JunctionAliasGenerator(
            reserved
        );

        const alias = generator.generate();

        expect(reserved.has(alias)).toBe(true);
    });
});
