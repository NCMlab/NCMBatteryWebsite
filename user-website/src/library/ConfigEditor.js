import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";
import { parseJson } from "./JsonEditor";
import ParameterEditor, { defaultParameters, validateParameters } from "./ParameterEditor";
import { KINDS } from "./kinds";
import { NAME_PATTERN, suggestCopyName } from "./copyName";

/**
 * Writes parameter sets:
 *   /library/parameter/new        a new set from scratch
 *   /library/parameter/:id/copy   an edited copy of an existing set, saved as a NEW row
 *   /library/parameter/:id/edit   the existing set changed in place (mode="edit"); every battery
 *                                 that uses it runs the new values
 * Instruction sets have their own editor (InstructionSetEditor).
 */
function ConfigEditor({ mode }) {
  const { kind, id } = useParams();
  const [searchParams] = useSearchParams();
  const cfg = KINDS[kind];
  const navigate = useNavigate();
  const { csrfToken } = useAuth();
  const isEdit = mode === "edit";
  const isCopy = Boolean(id) && !isEdit;

  const [taskTypes, setTaskTypes] = useState([]);
  const [existing, setExisting] = useState([]); // every set of this kind, for name-collision checks
  const [source, setSource] = useState(null); // the record being copied, if any
  const initialTaskTypeId = Number(searchParams.get("task_type_id")) || "";
  const [taskTypeId, setTaskTypeId] = useState(initialTaskTypeId);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("EN");
  const [text, setText] = useState("{\n  \n}");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    let cancelled = false;
    Promise.all([api.listTaskTypes(), cfg.list(), id ? api.getRecord(kind, id) : null])
      .then(([types, all, src]) => {
        if (cancelled) return;
        setTaskTypes(types);
        setExisting(all);
        if (src) {
          setSource(src);
          setTaskTypeId(src.task_type_id);
          setLanguage(src.language);
          setText(JSON.stringify(src[cfg.bodyKey], null, 2));
          const names = all.filter((r) => cfg.sameNameSpace(r, src.task_type_id, src.language)).map((r) => r[cfg.nameKey]);
          setName(isEdit ? src[cfg.nameKey] : suggestCopyName(src[cfg.nameKey], names));
        } else if (kind === "parameter") {
          // New set for a task chosen on the list page: start from that task's defaults.
          const def = types.find((t) => t.task_type_id === initialTaskTypeId)?.parameter_schema;
          if (def) setText(JSON.stringify(defaultParameters(def), null, 2));
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cfg, kind, id, isEdit, initialTaskTypeId]);

  if (!cfg) return <p className="error-text">Unknown library "{kind}".</p>;
  if (isEdit && kind !== "parameter") return <p className="app-container error-text">Only parameter sets can be edited in place.</p>;
  if (loading) return <p className="app-container">Loading...</p>;

  // Parameter sets are edited with the task's form when it has a schema, else as JSON.
  const schemaDef =
    kind === "parameter" ? taskTypes.find((t) => t.task_type_id === Number(taskTypeId))?.parameter_schema ?? null : null;

  const changeTaskType = (value) => {
    setTaskTypeId(value);
    // A new parameter set starts from the task's defaults, if it has a schema.
    const def = kind === "parameter" ? taskTypes.find((t) => t.task_type_id === value)?.parameter_schema : null;
    if (!isCopy && def && !parseJson(text).value) setText(JSON.stringify(defaultParameters(def), null, 2));
  };

  const parsed = parseJson(text);
  const nameTaken =
    !isEdit &&
    existing.some((r) => cfg.sameNameSpace(r, Number(taskTypeId), language) && r[cfg.nameKey] === name.trim());

  const handleSave = async () => {
    setError(null);
    if (!taskTypeId) return setError("Choose a task type.");
    if (!NAME_PATTERN.test(name.trim())) return setError("Name may only contain letters, numbers, and underscores.");
    if (nameTaken) return setError(`"${name.trim()}" already exists. Choose a new name; existing sets are never overwritten.`);
    if (!schemaDef) return setError("This task type has no parameter form, so a set can't be made for it here.");
    if (parsed.error) return setError(`These settings can't be saved: ${parsed.error}`);
    const problems = validateParameters(schemaDef, parsed.value);
    if (problems.length) return setError(`Check these fields: ${problems.join("; ")}`);

    if (isEdit) {
      const using = source.used_by.map((b) => b.battery_index);
      if (using.length && !window.confirm(`Battery index ${using.join(", ")} will run these new values from now on. Save the changes?`)) {
        return;
      }
      setSaving(true);
      try {
        await api.updateParameter(csrfToken, { parameterId: source[cfg.idKey], parameters: parsed.value });
        navigate(`/library/${kind}/${source[cfg.idKey]}`, { state: { message: `Saved changes to "${source[cfg.nameKey]}".` } });
      } catch (err) {
        setError(err.message);
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const result = await cfg.create(csrfToken, {
        taskTypeId: Number(taskTypeId),
        name: name.trim(),
        language,
        body: parsed.value,
      });
      navigate(`/library/${kind}`, {
        state: { message: `Saved new ${cfg.label} "${result[cfg.nameKey]}" (id ${result[cfg.idKey]}).` },
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="app-container">
      <p>
        <Link to={`/library/${kind}`}>← {cfg.title}</Link>
      </p>
      <h2>{isEdit ? `Edit: ${source?.[cfg.nameKey]}` : isCopy ? `Edit as copy: ${source?.[cfg.nameKey]}` : `New ${cfg.label}`}</h2>

      {isEdit && source && (
        <p className="warn-text">
          You are changing "{source[cfg.nameKey]}" itself, not a copy.
          {source.used_by.length > 0
            ? ` Battery index ${source.used_by.map((b) => b.battery_index).join(", ")} will run the new values from now on, and results already collected with the old values won't say so.`
            : " No battery uses it yet."}{" "}
          To keep the original, use Edit as copy instead.
        </p>
      )}

      {isCopy && source && (
        <p className="hint">
          Your changes will be saved as a <b>new</b> {cfg.label}. The original "{source[cfg.nameKey]}" stays unchanged
          {source.used_by.length > 0 && (
            <>
              {" "}
              and remains in use by battery index {source.used_by.map((b) => b.battery_index).join(", ")}. To switch
              those batteries to the new set, copy each battery and pick the new set in the builder
            </>
          )}
          .
        </p>
      )}

      <div className="form-grid">
        <label>
          Task type
          <select value={taskTypeId} onChange={(e) => changeTaskType(Number(e.target.value))} disabled={Boolean(id)}>
            <option value="">-- choose --</option>
            {taskTypes.map((t) => (
              <option key={t.task_type_id} value={t.task_type_id}>
                {t.task_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. RAVLT_Spoken_v2"
            disabled={isEdit}
          />
          {nameTaken && <span className="error-text">Already exists</span>}
        </label>
        <label>
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isEdit}>
            <option value="EN">EN</option>
            <option value="FR">FR</option>
            <option value="KR">KR</option>
          </select>
        </label>
      </div>

      <ParameterEditor schemaDef={schemaDef} text={text} onChange={setText} />

      {error && <p className="error-text">{error}</p>}
      <button className="primary" onClick={handleSave} disabled={saving || !!parsed.error || !schemaDef}>
        {saving ? "Saving..." : isEdit ? "Save changes" : `Save as new ${cfg.label}`}
      </button>
    </div>
  );
}

export default ConfigEditor;
