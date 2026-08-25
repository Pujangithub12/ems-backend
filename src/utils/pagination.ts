import { Request } from "express";

export interface PageParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/** Parses `page`/`pageSize` query params for a list endpoint, clamping to sane bounds. */
export function parsePageParams(req: Request): PageParams {
  const rawPage = parseInt(req.query.page as string, 10);
  const rawPageSize = parseInt(req.query.pageSize as string, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
