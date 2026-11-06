
import type {
    JoinTableOptions
} from '../../metadata/contracts';

import {
    appendDeclaration,
    JOIN_TABLES
} from './decorator-storage';

import {
    getRelationDecoratorContext
} from './relation-decorator-helper';

export function JoinTable(
    options: JoinTableOptions = {}
) {
    return function (
        _value: undefined,
        context: ClassFieldDecoratorContext
    ): void {
        const metadata = getRelationDecoratorContext(
            '@JoinTable',
            context
        );

        appendDeclaration(metadata, JOIN_TABLES, {
            propertyKey: context.name,
            options: {
                ...options,
                ...(options.joinColumns !== undefined
                    ? {
                        joinColumns: options.joinColumns.map(
                            column => ({ ...column })
                        )
                    }
                    : {}),
                ...(options.inverseJoinColumns !== undefined
                    ? {
                        inverseJoinColumns:
                            options.inverseJoinColumns.map(
                                column => ({ ...column })
                            )
                    }
                    : {})
            }
        });
    };
}
