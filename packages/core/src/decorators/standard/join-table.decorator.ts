
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

import { compatibleFieldDecorator } from './legacy-decorator-adapter';

export function JoinTable(
    options: JoinTableOptions = {}
) {
    return compatibleFieldDecorator(context => {
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
    });
}
