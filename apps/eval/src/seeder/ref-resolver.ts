/**
 * Bidirectional map between seed ref strings and database-generated IDs.
 * 种子数据引用字符串与数据库生成 ID 间的双向映射。
 */
export class RefResolver {
  private readonly refToId = new Map<string, number | string>();
  private readonly idToRef = new Map<number | string, string>();

  set(ref: string, id: number | string): void {
    if (this.refToId.has(ref)) {
      throw new Error(
        `Duplicate ref: "${ref}" already maps to ${this.refToId.get(ref)}`,
      );
    }
    this.refToId.set(ref, id);
    this.idToRef.set(id, ref);
  }

  getId(ref: string): number | string {
    const id = this.refToId.get(ref);
    if (id === undefined)
      throw new Error(`Unknown ref: "${ref}". Was the seed data loaded?`);
    return id;
  }

  getNumericId(ref: string): number {
    const id = this.getId(ref);
    if (typeof id !== "number")
      throw new Error(`Ref "${ref}" has non-numeric ID: ${id}`);
    return id;
  }

  getStringId(ref: string): string {
    const id = this.getId(ref);
    return String(id);
  }

  getRef(id: number | string): string | undefined {
    return this.idToRef.get(id);
  }

  entries(): IterableIterator<[string, number | string]> {
    return this.refToId.entries();
  }
}
