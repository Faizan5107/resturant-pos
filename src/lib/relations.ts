export function firstRelation<T>(relation: T | T[] | null): T | null {
  return (Array.isArray(relation) ? relation[0] : relation) as T | null;
}
