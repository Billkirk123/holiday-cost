export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(options?.headers ?? {});
    if (options?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    response = await fetch(path, {
      ...options,
      headers,
    });
  } catch {
    throw new Error("Could not reach the API. Check that the API and database are running.");
  }
  if (response.status === 204) return undefined as T;

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Could not reach the API. Check that the API and database are running.");
  }
  const result = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "Something went wrong. Please try again.");
  }
  return result;
}
