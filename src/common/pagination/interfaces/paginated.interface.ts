import { PageMeta } from '../interfaces/page-meta.interface';
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}
