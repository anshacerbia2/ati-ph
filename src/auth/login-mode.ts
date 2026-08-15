export function shouldUseSilentSso({
  fetchDestination,
  interactiveRequested,
}: {
  fetchDestination: string | null;
  interactiveRequested: boolean;
}): boolean {
  return fetchDestination?.toLowerCase() === "iframe" && !interactiveRequested;
}
