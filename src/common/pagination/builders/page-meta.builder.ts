import { PageMeta } from '../interfaces/page-meta.interface';

export function buildPageMeta(
  totalItems: number,
  page: number,
  limit: number,
): PageMeta {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    totalItems,
    itemCount: Math.min(limit, totalItems),
    itemsPerPage: limit,
    totalPages,
    currentPage: page,
  };
}
