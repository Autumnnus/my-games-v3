import type { IScreenshot } from "../../models/Screenshot";
import type { PaginationMeta, SortingMeta } from "./common.contract";

export type ScreenshotSortBy = "createdAt" | "updatedAt" | "name" | "type";

export interface ScreenshotListResponse {
  items: IScreenshot[];
  pagination: PaginationMeta;
  sorting: SortingMeta<ScreenshotSortBy>;
}
