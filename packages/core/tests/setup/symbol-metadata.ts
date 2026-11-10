console.log(
    '[TyORM Test Setup] Symbol.metadata:',
    Symbol.metadata
);
if (Symbol.metadata === undefined) {
    Object.defineProperty(Symbol, 'metadata', {
        value: Symbol('Symbol.metadata'),
        configurable: true,
        writable: false
    });
}
