export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationResult;
}

export function parsePaginationOptions(query: any): PaginationOptions {
  // Use explicit NaN check so that page=0 is NOT silently promoted to 1
  const parsedPage = parseInt(query.page);
  const parsedLimit = parseInt(query.limit);
  const page = isNaN(parsedPage) ? 1 : parsedPage;
  const limit = isNaN(parsedLimit) ? 50 : parsedLimit;

  // Validações
  if (page < 1) {
    throw new Error('Page must be greater than 0');
  }

  if (limit < 1 || limit > 100) {
    throw new Error('Limit must be between 1 and 100');
  }

  return { page, limit };
}

export function buildPaginationClause(options: PaginationOptions): string {
  const offset = (options.page - 1) * options.limit;
  return `LIMIT ${options.limit} OFFSET ${offset}`;
}

export function buildCountQuery(baseQuery: string): string {
  // Remove ORDER BY e adiciona COUNT
  const orderByIndex = baseQuery.toLowerCase().lastIndexOf('order by');
  const queryWithoutOrderBy = orderByIndex > -1 
    ? baseQuery.substring(0, orderByIndex).trim()
    : baseQuery;

  // Encontra o SELECT principal
  const selectIndex = queryWithoutOrderBy.toLowerCase().indexOf('select');
  const fromIndex = queryWithoutOrderBy.toLowerCase().indexOf('from');
  
  if (selectIndex > -1 && fromIndex > -1) {
    const selectClause = queryWithoutOrderBy.substring(selectIndex, fromIndex);
    const countQuery = queryWithoutOrderBy.replace(selectClause, 'SELECT COUNT(*) as total');
    return countQuery;
  }

  throw new Error('Invalid query for counting');
}

export function createPaginationResult(
  options: PaginationOptions,
  total: number
): PaginationResult {
  const totalPages = Math.ceil(total / options.limit);

  return {
    page: options.page,
    limit: options.limit,
    total,
    totalPages,
    hasNext: options.page < totalPages,
    hasPrev: options.page > 1
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  options: PaginationOptions,
  total: number
): PaginatedResponse<T> {
  return {
    success: true,
    data,
    pagination: createPaginationResult(options, total)
  };
}
