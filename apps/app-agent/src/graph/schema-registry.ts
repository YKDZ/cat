import * as z from "zod/v4";

export class SchemaRegistry {
  private schemas = new Map<string, z.ZodType>();

  private toKey = (name: string, version: string): string =>
    `${name}@${version}`;

  register = <TSchema extends z.ZodType>(
    name: string,
    version: string,
    schema: TSchema,
  ): TSchema => {
    const key = this.toKey(name, version);
    if (this.schemas.has(key)) {
      throw new Error(`Schema already registered: ${key}`);
    }
    this.schemas.set(key, schema);
    return schema;
  };

  get = (name: string, version: string): z.ZodType => {
    const key = this.toKey(name, version);
    const schema = this.schemas.get(key);
    if (!schema) {
      throw new Error(`Schema not found: ${key}`);
    }
    return schema;
  };

  has = (name: string, version: string): boolean => {
    return this.schemas.has(this.toKey(name, version));
  };

  parse = (name: string, version: string, input: unknown): unknown => {
    const schema = this.get(name, version);
    return schema.parse(input);
  };
}
