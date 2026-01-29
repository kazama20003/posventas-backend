import { Paginated } from '../interfaces/paginated.interface';
import { buildPageMeta } from './page-meta.builder';

export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    data,
    meta: buildPageMeta(total, page, limit),
  };
}
