export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
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
