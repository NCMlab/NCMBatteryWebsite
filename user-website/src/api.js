// Central client for both NCMBattery APIs:
//  - the public, unauthenticated read API (task types, existing parameter/instruction sets)
//  - the authenticated admin write API (login, create parameter/instruction/battery)
//
// Configure via .env.local (see NCMBatteryWebsite README) -- these fall back to localhost
// so `npm start` against a locally-running PHP server works without extra setup.
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost/api";
const ADMIN_API_BASE = process.env.REACT_APP_ADMIN_API_BASE || "http://localhost/api/admin";

async function handleResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body && body.error ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

function getJSON(url) {
  return fetch(url).then(handleResponse);
}

function postJSON(url, body, csrfToken) {
  const headers = { "Content-Type": "application/json" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  return fetch(url, {
    method: "POST",
    credentials: "include", // send/receive the admin session cookie
    headers,
    body: JSON.stringify(body),
  }).then(handleResponse);
}

// -- Public read API ---------------------------------------------------------

export function listTaskTypes() {
  return getJSON(`${API_BASE}/API_list_config.php?resource=task_types`);
}

// taskTypeId is optional for both: omit it to list every task type's sets.
// Each row includes used_by (how many battery tasks reference the set).
// Instruction rows are sets: { instruction_set_id, instruction_name, languages: ["EN","FR"], ... }.
export function listParameters(taskTypeId) {
  const q = taskTypeId ? `&task_type_id=${taskTypeId}` : "";
  return getJSON(`${API_BASE}/API_list_config.php?resource=parameters${q}`);
}

export function listInstructions(taskTypeId) {
  const q = taskTypeId ? `&task_type_id=${taskTypeId}` : "";
  return getJSON(`${API_BASE}/API_list_config.php?resource=instructions${q}`);
}

export function listBatteries() {
  return getJSON(`${API_BASE}/API_list_config.php?resource=batteries`);
}

/** Rows: { session_id, session_name, languages, button_count, battery_indexes, created_at }. */
export function listSessions() {
  return getJSON(`${API_BASE}/API_list_config.php?resource=sessions`);
}

export function getParameterDetail(taskName, parameterName) {
  const q = new URLSearchParams({ type: "parameters", task: taskName, name: parameterName });
  return getJSON(`${API_BASE}/API_task_config.php?${q}`);
}

export function getInstructionDetail(taskName, instructionName, language = "EN") {
  const q = new URLSearchParams({ type: "instructions", task: taskName, name: instructionName, lang: language });
  return getJSON(`${API_BASE}/API_task_config.php?${q}`);
}

// -- Admin auth ---------------------------------------------------------------

export function login(username, password) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_login.php`, { username, password });
}

export function logout() {
  return postJSON(`${ADMIN_API_BASE}/API_admin_logout.php`, {});
}

/** Checks whether the httpOnly session cookie still represents a logged-in admin. */
export function whoami() {
  return fetch(`${ADMIN_API_BASE}/API_admin_whoami.php`, { credentials: "include" }).then(handleResponse);
}

// -- Admin writes (all require a csrfToken from login()/whoami()) -------------

export function createParameter(csrfToken, { taskTypeId, taskName, parameterName, language, parameters }) {
  return postJSON(
    `${ADMIN_API_BASE}/API_admin_create_parameter.php`,
    { task_type_id: taskTypeId, task_name: taskName, parameter_name: parameterName, language, parameters },
    csrfToken
  );
}

/** Creates a new instruction set; translations is { EN: {...}, FR: {...} }. */
export function createInstruction(csrfToken, { taskTypeId, taskName, instructionName, translations }) {
  return postJSON(
    `${ADMIN_API_BASE}/API_admin_create_instruction.php`,
    { task_type_id: taskTypeId, task_name: taskName, instruction_name: instructionName, translations },
    csrfToken
  );
}

/** Adds one language to an existing instruction set (refused if it already has it). */
export function addTranslation(csrfToken, { instructionSetId, language, instructions }) {
  return postJSON(
    `${ADMIN_API_BASE}/API_admin_add_translation.php`,
    { instruction_set_id: instructionSetId, language, instructions },
    csrfToken
  );
}

export function createBattery(csrfToken, batteryPayload) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_create_battery.php`, batteryPayload, csrfToken);
}

// -- In-place edits: change an existing set or battery (everything that uses it sees the change) --

/** Replaces a parameter set's values; name, task type and language stay. Returns used_by battery indexes. */
export function updateParameter(csrfToken, { parameterId, parameters }) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_update_parameter.php`, { parameter_id: parameterId, parameters }, csrfToken);
}

/** Replaces a battery's header and task list; its battery_index stays. */
export function updateBattery(csrfToken, batteryId, batteryPayload) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_update_battery.php`, { ...batteryPayload, battery_id: batteryId }, csrfToken);
}

/**
 * Creates a new session; languages is { EN: { title, chooser_index, run_name_check, buttons: [
 * { name, battery_index, button_row, bit_index, phase, test, button_usage_type }] }, ... }.
 */
export function createSession(csrfToken, { sessionName, languages }) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_create_session.php`, { session_name: sessionName, languages }, csrfToken);
}

/** Adds one language to an existing session (refused if it already has it). */
export function addSessionLanguage(csrfToken, { sessionId, language, ...version }) {
  return postJSON(
    `${ADMIN_API_BASE}/API_admin_add_session_language.php`,
    { session_id: sessionId, language, ...version },
    csrfToken
  );
}

/**
 * Points session buttons at another battery, in place (the one in-place change to a session).
 * scope: "button" (needs language + sortOrder), "language" or "session"; see the PHP file.
 */
export function setSessionBattery(csrfToken, { sessionId, fromBatteryIndex, toBatteryIndex, scope, language, sortOrder }) {
  return postJSON(
    `${ADMIN_API_BASE}/API_admin_set_session_battery.php`,
    {
      session_id: sessionId,
      from_battery_index: fromBatteryIndex,
      to_battery_index: toBatteryIndex,
      scope,
      language,
      sort_order: sortOrder,
    },
    csrfToken
  );
}

export function deleteSessionLanguage(csrfToken, sessionId, language) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_delete.php`, { type: "session_language", id: sessionId, language }, csrfToken);
}

// -- Admin reads and lifecycle (copy-on-edit) ---------------------------------
// "Edit as copy" loads a record with getRecord() and saves it as a NEW record via
// createParameter/createInstruction/createBattery; "Edit" saves it back with update*().

/** type is "parameter" | "instruction" | "battery" | "session"; id is that table's primary key (instruction_set_id for instructions). */
export function getRecord(type, id) {
  const q = new URLSearchParams({ type, id });
  return fetch(`${ADMIN_API_BASE}/API_admin_get.php?${q}`, { credentials: "include" }).then(handleResponse);
}

/** Refused by the server if a parameter/instruction set is in use, or a battery is still active. */
export function deleteRecord(csrfToken, type, id) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_delete.php`, { type, id }, csrfToken);
}

/** Removes one language from an instruction set; refused while a battery uses the set. */
export function deleteTranslation(csrfToken, instructionSetId, language) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_delete.php`, { type: "translation", id: instructionSetId, language }, csrfToken);
}

export function setBatteryActive(csrfToken, batteryId, active) {
  return postJSON(`${ADMIN_API_BASE}/API_admin_set_battery_active.php`, { battery_id: batteryId, active }, csrfToken);
}
