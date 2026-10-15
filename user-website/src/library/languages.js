// Languages offered when adding a translation. The database takes any 2-letter code;
// these are the ones the tasks have label sets for (config/General_Setup.js).
// KR is this project's code for Korean (ISO would be KO).
export const LANGUAGES = [
  { code: "EN", name: "English" },
  { code: "FR", name: "French" },
  { code: "KR", name: "Korean" },
];

export function languageName(code) {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/** "EN" -> "EN (English)" for pull-downs. */
export function languageLabel(code) {
  const name = languageName(code);
  return name === code ? code : `${code} (${name})`;
}
