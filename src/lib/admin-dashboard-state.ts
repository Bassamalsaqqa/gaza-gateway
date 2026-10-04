export type DashboardReadState = "ready" | "loading" | "error";
type RepositoryRead = { isError: boolean; isPending: boolean; isSuccess: boolean };
/** A failed/refetch-failed read is unavailable even when a prior cached snapshot exists. */
export function dashboardReadState(...reads: RepositoryRead[]): DashboardReadState {
  if (reads.some((read) => read.isError)) return "error";
  if (reads.some((read) => read.isPending || !read.isSuccess)) return "loading";
  return "ready";
}
export function dashboardMetric(state: DashboardReadState, value: number): number | null {
  return state === "ready" ? value : null;
}
