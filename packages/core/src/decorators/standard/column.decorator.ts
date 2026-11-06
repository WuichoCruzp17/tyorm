
import type {
  ColumnOptions
} from '../../metadata/contracts';

import {
  appendDeclaration,
  COLUMNS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

export function Column(
  options: ColumnOptions
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext
  ): void {
    if (context.static || context.private) {
      throw new Error(
        '@Column can only decorate public instance fields.'
      );
    }

    appendDeclaration(
      requireDecoratorMetadata(context.metadata),
      COLUMNS,
      {
        propertyKey: context.name,
        options: { ...options }
      }
    );
  };
}
