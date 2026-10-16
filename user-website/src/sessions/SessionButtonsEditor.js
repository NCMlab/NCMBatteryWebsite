import React from "react";
import { Link } from "react-router-dom";

export const USAGE_TYPES = [
  { value: "", label: "Battery" },
  { value: "UserChoice", label: "Pick a test" },
];

/** Problems that stop a save, and warnings that don't, for one language's buttons. */
export function checkButtons(buttons, batteryByIndex) {
  const errors = [];
  const warnings = [];
  buttons.forEach((b, i) => {
    const n = `Button ${i + 1}${b.name ? ` ("${b.name}")` : ""}`;
    if (!String(b.name ?? "").trim()) errors.push(`Button ${i + 1} needs a name.`);
    if (b.battery_index === "" || b.battery_index == null) errors.push(`${n} needs a battery index.`);
    else if (!batteryByIndex[b.battery_index]) warnings.push(`${n}: battery ${b.battery_index} is not in the database.`);
    if (b.button_row === "" || b.button_row == null) warnings.push(`${n} has no row.`);
  });
  // Two normal buttons with one bit index would share a single "done" mark.
  const seen = new Map();
  buttons.forEach((b, i) => {
    if (b.button_usage_type || b.bit_index === "" || b.bit_index == null) return;
    const bit = Number(b.bit_index); // typed values are strings, loaded ones numbers
    if (seen.has(bit)) errors.push(`Buttons ${seen.get(bit)} and ${i + 1} both use bit index ${bit}.`);
    else seen.set(bit, i + 1);
  });
  return { errors, warnings };
}

/** Converts the editor's strings to what the API stores (numbers, or null when empty). */
export function buttonsForSave(buttons) {
  const num = (v) => (v === "" || v == null ? null : Number(v));
  const text = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
  return buttons.map((b) => ({
    name: String(b.name ?? "").trim(),
    battery_index: num(b.battery_index),
    button_row: num(b.button_row),
    bit_index: num(b.bit_index),
    phase: text(b.phase),
    test: text(b.test),
    button_usage_type: text(b.button_usage_type),
  }));
}

/** A new button below the last one: same row and battery, next free bit index. */
function nextButton(buttons) {
  const last = buttons[buttons.length - 1];
  const bits = buttons.filter((b) => !b.button_usage_type).map((b) => Number(b.bit_index)).filter(Number.isFinite);
  return {
    name: "",
    battery_index: last?.battery_index ?? "",
    button_row: last?.button_row ?? 1,
    bit_index: bits.length ? Math.max(...bits) + 1 : 1,
    phase: last?.phase ?? "",
    test: "",
    button_usage_type: "",
  };
}

/**
 * Editable table of one language's buttons. `reference` is the same session's buttons in the
 * language this one was copied from; its names are shown under each name box for translating.
 */
function SessionButtonsEditor({ buttons, onChange, batteries, batteryByIndex, reference, referenceLanguage }) {
  const set = (i, field, value) => onChange(buttons.map((b, j) => (j === i ? { ...b, [field]: value } : b)));
  const move = (i, d) => {
    const next = [...buttons];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const renumber = () => {
    let bit = 0;
    onChange(buttons.map((b) => (b.button_usage_type ? b : { ...b, bit_index: ++bit })));
  };

  return (
    <div className="session-buttons-editor">
      <datalist id="battery-indexes">
        {batteries.map((b) => (
          <option key={b.battery_id} value={b.battery_index}>
            {b.battery_name}
            {b.active ? "" : " (inactive)"}
          </option>
        ))}
      </datalist>
      <table className="data-table session-buttons">
        <thead>
          <tr>
            <th>#</th>
            <th>Button name</th>
            <th>Battery</th>
            <th>Row</th>
            <th>Bit</th>
            <th>Phase</th>
            <th>Test</th>
            <th>Type</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {buttons.map((b, i) => {
            const battery = batteryByIndex[b.battery_index];
            const refName = reference?.[i]?.name;
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <input type="text" value={b.name} onChange={(e) => set(i, "name", e.target.value)} />
                  {refName !== undefined && refName !== b.name && (
                    <div className="session-ref">
                      <span className="lang-badge">{referenceLanguage}</span>
                      {refName}
                    </div>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    className="num-input wide"
                    list="battery-indexes"
                    value={b.battery_index}
                    onChange={(e) => set(i, "battery_index", e.target.value)}
                  />
                  <div className={battery ? "session-battery-name" : "session-battery-name warn-text"}>
                    {b.battery_index === "" ? "" : battery ? (
                      <Link to={`/batteries/${battery.battery_id}`}>{battery.battery_name}</Link>
                    ) : (
                      "not in database"
                    )}
                  </div>
                </td>
                <td>
                  <input type="number" className="num-input" value={b.button_row} onChange={(e) => set(i, "button_row", e.target.value)} />
                </td>
                <td>
                  <input type="number" className="num-input" value={b.bit_index} onChange={(e) => set(i, "bit_index", e.target.value)} />
                </td>
                <td>
                  <input type="text" className="short-input" value={b.phase} onChange={(e) => set(i, "phase", e.target.value)} />
                </td>
                <td>
                  <input type="text" className="short-input" value={b.test} onChange={(e) => set(i, "test", e.target.value)} />
                </td>
                <td>
                  <select value={b.button_usage_type} onChange={(e) => set(i, "button_usage_type", e.target.value)}>
                    {USAGE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                    {!USAGE_TYPES.some((t) => t.value === b.button_usage_type) && (
                      <option value={b.button_usage_type}>{b.button_usage_type}</option>
                    )}
                  </select>
                </td>
                <td className="row-actions">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                    ↑
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === buttons.length - 1} title="Move down">
                    ↓
                  </button>
                  <button type="button" onClick={() => onChange(buttons.filter((_, j) => j !== i))} title="Remove button">
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="toolbar">
        <button type="button" onClick={() => onChange([...buttons, nextButton(buttons)])}>
          + Add button
        </button>
        <button type="button" onClick={renumber} title="Bit indexes 1, 2, 3, ... in list order; 'Pick a test' buttons keep theirs">
          Renumber bits in order
        </button>
      </div>
    </div>
  );
}

export default SessionButtonsEditor;
