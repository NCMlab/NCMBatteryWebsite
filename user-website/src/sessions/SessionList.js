import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";

/** Lists every session (button page of batteries), with view, copy-on-edit and delete. */
function SessionList() {
  const location = useLocation();
  const { csrfToken } = useAuth();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api
      .listSessions()
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const handleDelete = async (row) => {
    if (
      !window.confirm(
        `Permanently delete session "${row.session_name}" (${row.languages.join(", ")})? ` +
          "Any JATOS study component that names it will stop loading it."
      )
    ) {
      return;
    }
    setError(null);
    try {
      await api.deleteRecord(csrfToken, "session", row.session_id);
      reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-container">
      <h2>Sessions</h2>
      <p className="hint">
        A session is the page of buttons a participant starts from: each button runs one battery, and is marked done
        when that battery is finished. A JATOS study component picks the session by its name (e.g. COMM_99) and the
        participant's language picks the version. Sessions are never changed in place: <b>Edit as copy</b> saves a new
        name. Adding a language is allowed at any time.
      </p>
      {location.state?.message && <p className="ok-text">{location.state.message}</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="toolbar">
        <Link className="button" to="/sessions/new">
          + New session
        </Link>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Languages</th>
              <th>Buttons</th>
              <th>Batteries</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.session_id}>
                <td>{r.session_name}</td>
                <td>{r.languages.join(", ")}</td>
                <td>{r.button_count}</td>
                <td>{r.battery_indexes.join(", ")}</td>
                <td>{r.created_at?.slice(0, 10)}</td>
                <td className="row-actions">
                  <Link className="button" to={`/sessions/${r.session_id}`}>
                    View
                  </Link>
                  <Link className="button" to={`/sessions/${r.session_id}/copy`}>
                    Edit as copy
                  </Link>
                  <button className="danger" onClick={() => handleDelete(r)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>No sessions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SessionList;
