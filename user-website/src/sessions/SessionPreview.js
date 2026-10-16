import React from "react";
import { Link } from "react-router-dom";

/**
 * The button page as the participant sees it (CentralExecutive.html): buttons grouped by row,
 * in list order within a row. Buttons with no row go on a final row. Each button shows its
 * battery index and bit index underneath, which the real page doesn't.
 * With linkBatteries, a button whose battery is in the database opens that battery's page
 * (off in the editor, where leaving the page would lose unsaved changes). linkState is passed
 * to that page as router state (SessionView uses it for the battery page's back link).
 */
function SessionPreview({ title, buttons, batteryByIndex = {}, linkBatteries = false, linkState }) {
  const rows = new Map();
  buttons.forEach((b, i) => {
    const key = b.button_row ?? "none";
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push({ ...b, position: i + 1 });
  });
  const ordered = [...rows.entries()].sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : a - b));

  return (
    <div className="session-preview">
      <div className="session-preview-title">{title || <i>(no title)</i>}</div>
      {ordered.map(([row, items]) => (
        <div className="session-preview-row" key={row}>
          <span className="session-preview-rownum">{row === "none" ? "no row" : `row ${row}`}</span>
          {items.map((b) => {
            const battery = batteryByIndex[b.battery_index];
            const missing = b.battery_index !== "" && b.battery_index != null && !battery;
            const link = linkBatteries && battery;
            const Tag = link ? Link : "div";
            return (
              <Tag
                {...(link ? { to: `/batteries/${battery.battery_id}`, state: linkState } : {})}
                className={`session-preview-button${b.button_usage_type ? " user-choice" : ""}${missing ? " missing" : ""}${link ? " linked" : ""}`}
                key={b.position}
                title={[
                  link && `Open battery ${b.battery_index}: ${battery.battery_name}`,
                  `#${b.position}`,
                  b.phase && `Phase: ${b.phase}`,
                  b.test && `Test: ${b.test}`,
                  b.button_usage_type && `Type: ${b.button_usage_type}`,
                  missing && "This battery index is not in the database",
                ]
                  .filter(Boolean)
                  .join("\n")}
              >
                <span className="session-preview-name">{b.name || <i>(no name)</i>}</span>
                <span className="session-preview-meta">
                  battery {b.battery_index ?? "?"} · bit {b.bit_index ?? "—"}
                </span>
              </Tag>
            );
          })}
        </div>
      ))}
      {buttons.length === 0 && <p className="hint">No buttons yet.</p>}
    </div>
  );
}

export default SessionPreview;
