
import type {
  ColumnOptions
} from '../../metadata/contracts';

import {
  appendDeclaration,
  COLUMNS
} from './decorator-storage';
import { requireDecoratorMetadata } from './metadata-context';

import { compatibleFieldDecorator } from './legacy-decorator-adapter';

export function Column(
  options: ColumnOptions
) {
  return compatibleFieldDecorator(context => {
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
  });
}
