import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";
import InstructionFields, { compareWithReference, humanize } from "./InstructionFields";
import { languageLabel } from "./languages";

/**
 * One instruction set with a language pull-down: the chosen translation is shown as
 * read-only text, with the batteries that use the set. ?lang=FR opens on FR.
 */
function InstructionSetView() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("text");
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getRecord("instruction", id)
      .then((r) => !cancelled && setRecord(r))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !record) return <p className="app-container error-text">{error}</p>;
  if (!record) return <p className="app-container">Loading...</p>;

  const languages = record.translations.map((t) => t.language);
  const language = languages.includes(searchParams.get("lang")) ? searchParams.get("lang") : languages[0];
  const translation = record.translations.find((t) => t.language === language);
  const en = record.translations.find((t) => t.language === "EN");
  const inUse = record.used_by.length > 0;
  const title = `${record.task_name}: ${record.instruction_name}`;

  const reload = (lang) =>
    api.getRecord("instruction", id).then((r) => {
      setRecord(r);
      setSearchParams(lang ? { lang } : {});
    });

  const handleDeleteSet = async () => {
    if (!window.confirm(`Permanently delete instruction set "${title}" and all its languages (${languages.join(", ")})?`)) return;
    setError(null);
    try {
      await api.deleteRecord(csrfToken, "instruction", record.instruction_set_id);
      navigate("/library/instruction", { state: { message: `Deleted instruction set "${title}".` } });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteLanguage = async () => {
    if (!window.confirm(`Remove the ${language} translation of "${title}"? The other languages stay.`)) return;
    setError(null);
    try {
      await api.deleteTranslation(csrfToken, record.instruction_set_id, language);
      await reload(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // How this language compares with EN, for the summary line under the pull-down.
  const gaps = language !== "EN" && en ? compareWithReference(translation.instructions, en.instructions) : null;

  return (
    <div className="app-container">
      <p>
        <Link to="/library/instruction">← Instruction sets</Link>
      </p>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="nav-spacer" />
        <Link className="button" to={`/library/instruction/${record.instruction_set_id}/add-language`}>
          + Add language
        </Link>
        <Link className="button" to={`/library/instruction/${record.instruction_set_id}/copy`}>
          Edit as copy
        </Link>
        <button
          className="danger"
          onClick={handleDeleteSet}
          disabled={inUse}
          title={inUse ? "In use by a battery; cannot be deleted" : ""}
        >
          Delete set
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table className="data-table details-table">
        <tbody>
          <tr>
            <th>Task</th>
            <td>{record.task_name}</td>
          </tr>
          <tr>
            <th>Languages</th>
            <td>{languages.join(", ")}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>{record.created_at}</td>
          </tr>
          <tr>
            <th>Used by</th>
            <td>
              {!inUse
                ? "No batteries"
                : record.used_by.map((b, i) => (
                    <React.Fragment key={b.battery_id}>
                      {i > 0 && ", "}
                      <Link to={`/batteries/${b.battery_id}`}>
                        {b.battery_index} ({b.battery_name}){b.active ? "" : " — inactive"}
                      </Link>
                    </React.Fragment>
                  ))}
            </td>
          </tr>
        </tbody>
      </table>

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
        {language !== "EN" && en && (
          <label>
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Show EN under each
            field
          </label>
        )}
        <span className="nav-spacer" />
        {languages.length > 1 && (
          <button
            className="danger"
            onClick={handleDeleteLanguage}
            disabled={inUse}
            title={inUse ? "The set is used by a battery, so its languages cannot be removed" : ""}
          >
            Remove {language}
          </button>
        )}
      </div>
      {gaps && gaps.missing.length > 0 && !compare && (
        <p className="warn-text">Missing compared with EN: {gaps.missing.map(humanize).join(", ")}.</p>
      )}
      {gaps && gaps.lengthDiffs.length > 0 && (
        <p className="warn-text">
          Different number of pages from EN:{" "}
          {gaps.lengthDiffs.map((d) => `${humanize(d.key)} (EN ${d.reference}, ${language} ${d.value})`).join("; ")}.
        </p>
      )}
      <p className="hint">
        Text can't be changed in place, because batteries may already use it. To change it, use <b>Edit as copy</b> (saved
        as a new set). Adding a language doesn't change the existing ones, so it's allowed at any time.
      </p>

      <div className="view-toggle">
        <button type="button" className={view === "text" ? "selected" : ""} onClick={() => setView("text")}>
          Text
        </button>
        <button type="button" className={view === "json" ? "selected" : ""} onClick={() => setView("json")}>
          JSON
        </button>
        <span className="hint">Created {translation.created_at}</span>
      </div>
      {view === "text" ? (
        <InstructionFields
          value={translation.instructions}
          reference={compare && language !== "EN" ? en?.instructions : null}
          readOnly
        />
      ) : (
        <pre className="json-view json-view-full">{JSON.stringify(translation.instructions, null, 2)}</pre>
      )}
    </div>
  );
}

export default InstructionSetView;
