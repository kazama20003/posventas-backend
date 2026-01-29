import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { buildPaginatedResult } from '../builders/paginated.builder';

type PrismaDelegate<T> = {
  count(args?: unknown): Promise<number>;
  findMany(args?: unknown): Promise<T[]>;
};

export async function paginatePrisma<T>(
  model: PrismaDelegate<T>,
  pagination: PaginationQueryDto,
  options?: {
    where?: unknown;
    include?: unknown;
    select?: unknown;
    orderBy?: unknown;
  },
) {
  const page = pagination.page ?? 1;
  const limit = pagination.limit ?? 10;
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    model.count({ where: options?.where }),
    model.findMany({
      ...options,
      skip,
      take: limit,
    }),
  ]);

  return buildPaginatedResult(data, total, page, limit);
}
