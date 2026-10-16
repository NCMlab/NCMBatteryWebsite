import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";
import InstructionFields from "./InstructionFields";
import { LANGUAGES, languageLabel } from "./languages";
import { NAME_PATTERN, suggestCopyName } from "./copyName";

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Writes instruction sets, as text boxes with a language pull-down. Three modes:
 *   new          /library/instruction/new              a new set, optionally started from an existing one
 *   copy         /library/instruction/:id/copy         an edited copy of a set, saved under a new name
 *   addLanguage  /library/instruction/:id/add-language one new language added to an existing set
 * Existing translations are never changed (copy-on-edit, as for parameter sets): "copy" and
 * "new" create a new set with all of its languages; "addLanguage" only adds a row.
 */
function InstructionSetEditor({ mode }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { csrfToken } = useAuth();

  const [taskTypes, setTaskTypes] = useState([]);
  const [taskSets, setTaskSets] = useState([]); // the chosen task type's sets, for "start from" and name checks
  const [source, setSource] = useState(null); // the set being copied / translated
  const [taskTypeId, setTaskTypeId] = useState(Number(searchParams.get("task_type_id")) || "");
  const [startFrom, setStartFrom] = useState(""); // new mode: id of the set to start from, "" = blank
  const [name, setName] = useState("");
  const [translations, setTranslations] = useState([]); // copy/new: [{ language, value }] in display order
  const [addValue, setAddValue] = useState(null); // addLanguage: the new language's text
  const [active, setActive] = useState("EN");
  const [showReference, setShowReference] = useState(true);
  const [newLang, setNewLang] = useState(""); // add-language mode / "+ Add language" in the other modes
  const [otherLang, setOtherLang] = useState("");
  const [copyFrom, setCopyFrom] = useState("EN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load task types, and for copy/addLanguage the source set.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listTaskTypes(), id ? api.getRecord("instruction", id) : null])
      .then(([types, src]) => {
        if (cancelled) return;
        setTaskTypes(types);
        if (!src) return;
        setSource(src);
        setTaskTypeId(src.task_type_id);
        const first = src.translations[0].language;
        setCopyFrom(src.translations.some((t) => t.language === "EN") ? "EN" : first);
        if (mode === "copy") {
          setTranslations(src.translations.map((t) => ({ language: t.language, value: clone(t.instructions) })));
          setActive(first);
        } else {
          const free = LANGUAGES.find((l) => !src.translations.some((t) => t.language === l.code));
          setNewLang(free ? free.code : "other");
          const start = src.translations.find((t) => t.language === "EN") ?? src.translations[0];
          setAddValue(clone(start.instructions));
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  // The chosen task type's sets: copy-name suggestions, duplicate-name check, "start from" choices.
  useEffect(() => {
    if (!taskTypeId) return setTaskSets([]);
    let cancelled = false;
    api
      .listInstructions(taskTypeId)
      .then((sets) => {
        if (cancelled) return;
        setTaskSets(sets);
        if (mode === "copy" && source) setName(suggestCopyName(source.instruction_name, sets.map((s) => s.instruction_name)));
        if (mode === "new") setStartFrom(String((sets.find((s) => s.instruction_name === "Default") || sets[0])?.instruction_set_id ?? ""));
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [taskTypeId, mode, source]);

  // New mode: copy every language of the "start from" set, or start blank in EN.
  useEffect(() => {
    if (mode !== "new") return;
    if (!startFrom) {
      setTranslations([{ language: "EN", value: {} }]);
      setActive("EN");
      return;
    }
    let cancelled = false;
    api
      .getRecord("instruction", startFrom)
      .then((src) => {
        if (cancelled) return;
        setTranslations(src.translations.map((t) => ({ language: t.language, value: clone(t.instructions) })));
        setActive(src.translations[0].language);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mode, startFrom]);

  if (loading) return <p className="app-container">Loading...</p>;
  if (error && id && !source) return <p className="app-container error-text">{error}</p>;

  const taskName = source?.task_name ?? taskTypes.find((t) => t.task_type_id === Number(taskTypeId))?.task_name;
  const sourceValue = (lang) => source?.translations.find((t) => t.language === lang)?.instructions;

  const addLangCode = newLang === "other" ? otherLang.trim().toUpperCase() : newLang;

  // -- copy / new: several translations with a language pull-down ------------------------
  const current = translations.find((t) => t.language === active) ?? translations[0];
  const setCurrentValue = (value) =>
    setTranslations((ts) => ts.map((t) => (t.language === current.language ? { ...t, value } : t)));
  const english = translations.find((t) => t.language === "EN");
  const reference =
    mode === "addLanguage"
      ? sourceValue(copyFrom)
      : current && current.language !== "EN" && english && showReference
      ? english.value
      : null;
  const referenceLanguage = mode === "addLanguage" ? copyFrom : "EN";

  const switchLanguage = (lang) => {
    setError(null);
    setActive(lang);
  };

  const addTranslation = () => {
    const code = addLangCode;
    if (!/^[A-Z]{2}$/.test(code)) return setError("A language code is 2 letters, e.g. ES.");
    if (translations.some((t) => t.language === code)) return setError(`${code} is already in this set.`);
    const from = translations.find((t) => t.language === copyFrom) ?? current;
    setTranslations((ts) => [...ts, { language: code, value: clone(from.value) }]);
    setError(null);
    setActive(code);
    setNewLang("");
  };

  const removeTranslation = () => {
    if (!window.confirm(`Remove ${current.language} from this new set?`)) return;
    const rest = translations.filter((t) => t.language !== current.language);
    setTranslations(rest);
    setActive(rest[0].language);
  };

  const editorValue = mode === "addLanguage" ? addValue : current?.value;
  const setEditorValue = mode === "addLanguage" ? setAddValue : setCurrentValue;

  const nameTaken = taskSets.some((s) => s.instruction_name === name.trim());

  const handleSave = async () => {
    setError(null);
    const all = mode === "addLanguage" ? [{ language: addLangCode, value: addValue }] : translations;
    const empty = all.filter((t) => !t.value || Object.keys(t.value).length === 0).map((t) => t.language);
    if (empty.length) return setError(`These languages have no fields yet: ${empty.join(", ")}.`);

    setSaving(true);
    try {
      if (mode === "addLanguage") {
        if (!/^[A-Z]{2}$/.test(addLangCode)) throw new Error("A language code is 2 letters, e.g. ES.");
        if (source.translations.some((t) => t.language === addLangCode)) throw new Error(`${addLangCode} already exists.`);
        await api.addTranslation(csrfToken, {
          instructionSetId: source.instruction_set_id,
          language: addLangCode,
          instructions: addValue,
        });
        navigate(`/library/instruction/${source.instruction_set_id}?lang=${addLangCode}`);
        return;
      }
      if (!taskTypeId) throw new Error("Choose a task type.");
      if (!NAME_PATTERN.test(name.trim())) throw new Error("Name may only contain letters, numbers, and underscores.");
      if (nameTaken) throw new Error(`"${name.trim()}" already exists for ${taskName}. Existing sets are never overwritten.`);
      const result = await api.createInstruction(csrfToken, {
        taskTypeId: Number(taskTypeId),
        instructionName: name.trim(),
        translations: Object.fromEntries(translations.map((t) => [t.language, t.value])),
      });
      navigate(`/library/instruction/${result.instruction_set_id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const languagePicker = (existing) => (
    <>
      <select value={newLang} onChange={(e) => setNewLang(e.target.value)}>
        {mode !== "addLanguage" && <option value="">+ Add language...</option>}
        {LANGUAGES.filter((l) => !existing.includes(l.code)).map((l) => (
          <option key={l.code} value={l.code}>
            {languageLabel(l.code)}
          </option>
        ))}
        <option value="other">Other...</option>
      </select>
      {newLang === "other" && (
        <input
          type="text"
          className="lang-code-input"
          value={otherLang}
          maxLength={2}
          onChange={(e) => setOtherLang(e.target.value.toUpperCase())}
          placeholder="ES"
        />
      )}
    </>
  );

  const heading =
    mode === "addLanguage"
      ? `Add a language: ${taskName} / ${source?.instruction_name}`
      : mode === "copy"
      ? `Edit as copy: ${taskName} / ${source?.instruction_name}`
      : "New instruction set";

  return (
    <div className="app-container">
      <p>
        <Link to={source ? `/library/instruction/${source.instruction_set_id}` : "/library/instruction"}>
          ← {source ? `${taskName}: ${source.instruction_name}` : "Instruction sets"}
        </Link>
      </p>
      <h2>{heading}</h2>

      {mode === "addLanguage" && source && (
        <>
          <p className="hint">
            The new language is added to "{source.instruction_name}" and the existing languages (
            {source.translations.map((t) => t.language).join(", ")}) stay exactly as they are, so this is allowed even
            when batteries use the set. Participants who choose this language will see it.
          </p>
          <div className="form-grid">
            <label>
              New language
              <span>{languagePicker(source.translations.map((t) => t.language))}</span>
            </label>
            <label>
              Start from
              <select
                value={copyFrom}
                onChange={(e) => {
                  if (!window.confirm(`Start again from ${e.target.value}? Text typed so far is replaced.`)) return;
                  setCopyFrom(e.target.value);
                  setAddValue(clone(sourceValue(e.target.value)));
                }}
              >
                {source.translations.map((t) => (
                  <option key={t.language} value={t.language}>
                    a copy of {languageLabel(t.language)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">
            Replace the {copyFrom} text in each box with the translation. The {copyFrom} text stays shown above each box.
            Fields marked <span className="code-badge">code</span> are used by the task itself (file paths, question
            names), so they normally stay the same.
          </p>
        </>
      )}

      {mode !== "addLanguage" && (
        <>
          {source && (
            <p className="hint">
              Saved as a <b>new</b> set with all of its languages. "{source.instruction_name}" stays unchanged
              {source.used_by.length > 0 &&
                ` for battery index ${source.used_by.map((b) => b.battery_index).join(", ")}. To switch those batteries to the new set, copy each battery and pick it in the builder`}
              .
            </p>
          )}
          <div className="form-grid">
            <label>
              Task type
              <select value={taskTypeId} onChange={(e) => setTaskTypeId(Number(e.target.value))} disabled={!!source}>
                <option value="">-- choose --</option>
                {taskTypes.map((t) => (
                  <option key={t.task_type_id} value={t.task_type_id}>
                    {t.task_name}
                  </option>
                ))}
              </select>
            </label>
            {mode === "new" && taskTypeId && (
              <label>
                Start from
                <select value={startFrom} onChange={(e) => setStartFrom(e.target.value)}>
                  <option value="">Blank</option>
                  {taskSets.map((s) => (
                    <option key={s.instruction_set_id} value={s.instruction_set_id}>
                      a copy of {s.instruction_name} ({s.languages.join(", ")})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Default_v2" />
              {nameTaken && <span className="error-text">Already exists</span>}
            </label>
          </div>

          {translations.length > 0 && (
            <div className="toolbar language-bar">
              <label>
                Language{" "}
                <select value={current?.language} onChange={(e) => switchLanguage(e.target.value)}>
                  {translations.map((t) => (
                    <option key={t.language} value={t.language}>
                      {languageLabel(t.language)}
                    </option>
                  ))}
                </select>
              </label>
              {languagePicker(translations.map((t) => t.language))}
              {newLang && (
                <>
                  <label>
                    copied from{" "}
                    <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                      {translations.map((t) => (
                        <option key={t.language} value={t.language}>
                          {t.language}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={addTranslation}>
                    Add
                  </button>
                </>
              )}
              {current && current.language !== "EN" && english && (
                <label>
                  <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />{" "}
                  Show EN above each box
                </label>
              )}
              <span className="nav-spacer" />
              {translations.length > 1 && (
                <button type="button" className="danger" onClick={removeTranslation}>
                  Remove {current.language}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {editorValue && (
        <InstructionFields
          value={editorValue}
          onChange={setEditorValue}
          reference={reference}
          referenceLanguage={referenceLanguage}
        />
      )}

      {error && <p className="error-text">{error}</p>}
      <p>
        <button className="primary" onClick={handleSave} disabled={saving || !editorValue}>
          {saving
            ? "Saving..."
            : mode === "addLanguage"
            ? `Add ${addLangCode || "language"} to "${source?.instruction_name}"`
            : `Save as new instruction set${translations.length > 1 ? ` (${translations.map((t) => t.language).join(", ")})` : ""}`}
        </button>
      </p>
    </div>
  );
}

export default InstructionSetEditor;
