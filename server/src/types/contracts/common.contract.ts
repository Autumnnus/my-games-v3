export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SortingMeta<TSortBy extends string = string> {
  sortBy: TSortBy;
  order: "asc" | "desc";
}
