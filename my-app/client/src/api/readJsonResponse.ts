export async function readJsonResponse(response: Response, requestName: string): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/(?:application\/json|\+json)/i.test(contentType)) {
    if (response.status === 404) {
      throw new Error(`${requestName} endpoint was not found (HTTP 404). Check that the API server is running and the /api proxy is configured.`);
    }
    throw new Error(`${requestName} returned HTTP ${response.status} with ${contentType || 'an unexpected response'} instead of JSON.`);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`${requestName} returned invalid JSON (HTTP ${response.status}).`);
  }
}
