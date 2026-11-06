export class MetadataError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MetadataError';
    }
}
