import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";
import { draftFromBattery } from "../draft";
import { languageLabel } from "../library/languages";
import SessionPreview from "./SessionPreview";

/** One session with a language pull-down: the button layout, and every button's settings. */
function SessionView({ draft, setDraft }) {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { csrfToken } = useAuth();
  const [session, setSession] = useState(null);
  const [batteryByIndex, setBatteryByIndex] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getRecord("session", id), api.listBatteries()])
      .then(([s, batteries]) => {
        if (cancelled) return;
        setSession(s);
        setBatteryByIndex(Object.fromEntries(batteries.map((b) => [b.battery_index, b])));
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !session) return <p className="app-container error-text">{error}</p>;
  if (!session) return <p className="app-container">Loading...</p>;

  const languages = session.languages.map((l) => l.language);
  const language = languages.includes(searchParams.get("lang")) ? searchParams.get("lang") : languages[0];
  const version = session.languages.find((l) => l.language === language);
  // The battery page's back link returns here, to this language.
  const batteryLinkState = { backTo: { path: `/sessions/${session.session_id}?lang=${language}`, label: `Session ${session.session_name}` } };
  const missing = [...new Set(version.buttons.map((b) => b.battery_index).filter((i) => !batteryByIndex[i]))];

  // Opens a button's battery in the builder; after saving, the builder offers to point this
  // session at the new battery (in place -- see API_admin_set_session_battery.php).
  const handleEditBattery = async (button, i) => {
    if (draft.items.length > 0 && !window.confirm("Replace the battery currently in the builder?")) return;
    try {
      const record = await api.getRecord("battery", batteryByIndex[button.battery_index].battery_id);
      setDraft(
        draftFromBattery(record, {
          sessionId: session.session_id,
          sessionName: session.session_name,
          language,
          sortOrder: i + 1,
          buttonName: button.name,
          fromBatteryIndex: button.battery_index,
          sameInLanguage: version.buttons.filter((b) => b.battery_index === button.battery_index).length,
          sameInSession: session.languages.flatMap((l) => l.buttons).filter((b) => b.battery_index === button.battery_index)
            .length,
        })
      );
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteSession = async () => {
    if (
      !window.confirm(
        `Permanently delete session "${session.session_name}" and all its languages? ` +
          "Any JATOS study component that names it will stop loading it."
      )
    ) {
      return;
    }
    try {
      await api.deleteRecord(csrfToken, "session", session.session_id);
      navigate("/sessions", { state: { message: `Deleted session "${session.session_name}".` } });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteLanguage = async () => {
    if (!window.confirm(`Remove the ${language} version of "${session.session_name}"? The other languages stay.`)) return;
    try {
      await api.deleteSessionLanguage(csrfToken, session.session_id, language);
      setSession(await api.getRecord("session", id));
      setSearchParams({});
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-container">
      <p>
        <Link to="/sessions">← Sessions</Link>
      </p>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Session {session.session_name}</h2>
        <span className="nav-spacer" />
        <Link className="button" to={`/sessions/${session.session_id}/add-language`}>
          + Add language
        </Link>
        <Link className="button" to={`/sessions/${session.session_id}/copy`}>
          Edit as copy
        </Link>
        <button className="danger" onClick={handleDeleteSession}>
          Delete session
        </button>
      </div>
      {location.state?.message && <p className="ok-text">{location.state.message}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="toolbar language-bar">
        <label>
          Language{" "}
          <select value={language} onChange={(e) => setSearchParams({ lang: e.target.value })}>
            {languages.map((l) => (
              <option key={l} value={l}>
                {languageLabel(l)}
              </option>
            ))}
          </select>
        </label>
        <span className="hint">
          {version.buttons.length} buttons · created {version.created_at}
          {version.chooser_index !== null && ` · index ${version.chooser_index}`}
          {version.run_name_check !== null && ` · name check ${version.run_name_check ? "on" : "off"}`}
        </span>
        <span className="nav-spacer" />
        {languages.length > 1 && (
          <button className="danger" onClick={handleDeleteLanguage}>
            Remove {language}
          </button>
        )}
      </div>
      {missing.length > 0 && (
        <p className="warn-text">
          Battery index {missing.join(", ")} {missing.length === 1 ? "is" : "are"} not in the database, so{" "}
          {missing.length === 1 ? "that button" : "those buttons"} can't run from it yet.
        </p>
      )}

      <h3>Layout</h3>
      <SessionPreview
        title={version.title}
        buttons={version.buttons}
        batteryByIndex={batteryByIndex}
        linkBatteries
        linkState={batteryLinkState}
      />
      <p className="hint">
        Click a button to open its battery. To change a button's task list, use <b>Edit battery</b> in the table below:
        the battery opens in the builder, is saved under a new index, and this session's button is switched to it.
      </p>

      <h3>Buttons</h3>
      <table className="data-table">
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
          {version.buttons.map((b, i) => {
            const battery = batteryByIndex[b.battery_index];
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{b.name}</td>
                <td>
                  {battery ? (
                    <Link to={`/batteries/${battery.battery_id}`} state={batteryLinkState} title={battery.battery_name}>
                      {b.battery_index}
                    </Link>
                  ) : (
                    <span className="warn-text" title="Not in the database">
                      {b.battery_index}
                    </span>
                  )}
                </td>
                <td>{b.button_row ?? "—"}</td>
                <td>{b.bit_index ?? "—"}</td>
                <td>{b.phase ?? "—"}</td>
                <td>{b.test ?? "—"}</td>
                <td>{b.button_usage_type === "UserChoice" ? "Pick a test" : b.button_usage_type ?? "Battery"}</td>
                <td>
                  {battery && (
                    <button
                      onClick={() => handleEditBattery(b, i)}
                      title={`Edit battery ${b.battery_index}'s task list in the builder, then point this button at the result`}
                    >
                      Edit battery
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default SessionView;
