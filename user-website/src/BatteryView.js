import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import * as api from "./api";
import { draftFromBattery } from "./draft";
import { iconForTaskType } from "./iconMap";

/** Read-only view of one battery: its settings and ordered task list. */
function BatteryView({ draft, setDraft }) {
  const { batteryId } = useParams();
  const navigate = useNavigate();
  const backTo = useLocation().state?.backTo;
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getRecord("battery", batteryId)
      .then((b) => !cancelled && setBattery(b))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [batteryId]);

  // edit=false: "Edit as copy" (saved under a new index); edit=true: "Edit" (saved back in place).
  const handleCopy = (edit = false) => {
    if (draft.items.length > 0 && !window.confirm("Replace the battery currently in the builder?")) return;
    setDraft(draftFromBattery(battery, null, { edit }));
    navigate("/");
  };

  if (error) return <p className="app-container error-text">{error}</p>;
  if (!battery) return <p className="app-container">Loading...</p>;

  const list = (arr) => (arr && arr.length ? arr.join(", ") : "—");
  const fields = [
    ["Battery index", battery.battery_index],
    ["Status", battery.active ? "Active" : "Inactive"],
    ["Name", battery.battery_name],
    ["Description", battery.description],
    ["Battery instructions", battery.battery_instructions],
    ["Language", battery.language],
    ["Run audio test", battery.run_audio_test ? "Yes" : "No"],
    ["Footer", battery.footer],
    ["Short name", battery.short_name],
    ["Header buttons", list(battery.header_buttons)],
    ["Languages to show", list(battery.languages_to_show)],
    ["Redirect URL", battery.redirect_url],
    ["Created", battery.created_at],
  ];

  return (
    <div className="app-container">
      <p>
        {/* A page that links here can pass state.backTo = { path, label } (e.g. the session it came from). */}
        <Link to={backTo?.path ?? "/batteries"}>← {backTo?.label ?? "Batteries"}</Link>
      </p>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>
          Battery {battery.battery_index}: {battery.battery_name}
        </h2>
        <span className="nav-spacer" />
        <button onClick={() => handleCopy(true)} title="Change this battery itself; its index stays the same">
          Edit
        </button>
        <button onClick={() => handleCopy()}>Edit as copy</button>
      </div>

      <table className="data-table details-table">
        <tbody>
          {fields.map(([label, value]) => (
            <tr key={label}>
              <th>{label}</th>
              <td>{value === null || value === undefined || value === "" ? "—" : String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Tasks ({battery.tasks.length})</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Task</th>
            <th>Label</th>
            <th>Parameter set</th>
            <th>Instruction set</th>
          </tr>
        </thead>
        <tbody>
          {battery.tasks.map((t) => (
            <tr key={t.sort_order}>
              <td>{t.sort_order}</td>
              <td className="task-cell">
                <img src={iconForTaskType(t.icon_file)} alt="" />
                {t.task_name}
              </td>
              <td>{t.icon_name}</td>
              {/* Each set opens on its own page, as a form or as text boxes. */}
              <td>
                {t.parameter_id ? (
                  <Link to={`/library/parameter/${t.parameter_id}`}>{t.parameter_name}</Link>
                ) : (
                  <i>none</i>
                )}
              </td>
              <td>
                {t.instruction_set_id ? (
                  <Link to={`/library/instruction/${t.instruction_set_id}`}>
                    {t.instruction_name} ({t.instruction_languages.join(", ")})
                  </Link>
                ) : (
                  <i>none</i>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BatteryView;
