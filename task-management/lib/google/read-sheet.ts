import { getServiceAccountToken, GOOGLE_SCOPES } from "./service-account";

/**
 * Read one range of a Google Sheet as a raw matrix (rows of string cells), via
 * the Firebase service account — the same auth the nightly backup uses. The
 * sheet must be shared with FIREBASE_CLIENT_EMAIL (Viewer is enough).
 *
 * Returns [] when the range is empty. Trailing empty cells are NOT padded by
 * the API, so callers must index defensively (the salary mappers already do).
 */
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export async function readSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const token = await getServiceAccountToken([GOOGLE_SCOPES.sheets]);
  const res = await fetch(
    `${SHEETS}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}
