import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as api from "../api";
import { useAuth } from "../AuthContext";
import { NAME_PATTERN, suggestCopyName } from "../library/copyName";
import { LANGUAGES, languageLabel } from "../library/languages";
import SessionButtonsEditor, { buttonsForSave, checkButtons } from "./SessionButtonsEditor";
import SessionPreview from "./SessionPreview";

// The editor keeps every field as a string so inputs can be empty while typing.
const toEditable = (version) => ({
  language: version.language,
  title: version.title ?? "",
  chooser_index: version.chooser_index ?? "",
  run_name_check: version.run_name_check === null || version.run_name_check === undefined ? "" : String(version.run_name_check),
  buttons: version.buttons.map((b) => ({
    name: b.name ?? "",
    battery_index: b.battery_index ?? "",
    button_row: b.button_row ?? "",
    bit_index: b.bit_index ?? "",
    phase: b.phase ?? "",
    test: b.test ?? "",
    button_usage_type: b.button_usage_type ?? "",
  })),
});

const forSave = (v) => ({
  title: v.title.trim(),
  chooser_index: v.chooser_index === "" ? null : Number(v.chooser_index),
  run_name_check: v.run_name_check === "" ? null : v.run_name_check === "true",
  buttons: buttonsForSave(v.buttons),
});

const blankVersion = (language) => ({
  language,
  title: language === "FR" ? "De quelle session s'agit-il?" : "What session is this?",
  chooser_index: "",
  run_name_check: "",
  buttons: [{ name: "Enter Name", battery_index: 72, button_row: 1, bit_index: 1, phase: "Name", test: "Name", button_usage_type: "" }],
});

/**
 * Builds sessions. Three modes, as for instruction sets:
 *   new          /sessions/new                 a new session, blank or copied from an existing one
 *   copy         /sessions/:id/copy            an edited copy of a session (every language), new name
 *   addLanguage  /sessions/:id/add-language    one new language added to an existing session
 */
function SessionEditor({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { csrfToken } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [batteries, setBatteries] = useState([]);
  const [source, setSource] = useState(null);
  const [startFrom, setStartFrom] = useState("");
  const [name, setName] = useState("");
  const [versions, setVersions] = useState([]);
  const [active, setActive] = useState("EN");
  const [newLang, setNewLang] = useState("");
  const [otherLang, setOtherLang] = useState("");
  const [copyFrom, setCopyFrom] = useState("EN");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listSessions(), api.listBatteries(), id ? api.getRecord("session", id) : null])
      .then(([all, bats, src]) => {
        if (cancelled) return;
        setSessions(all);
        setBatteries(bats);
        if (!src) {
          setVersions([blankVersion("EN")]);
          return;
        }
        setSource(src);
        const first = src.languages[0];
        const en = src.languages.find((l) => l.language === "EN") ?? first;
        setCopyFrom(en.language);
        if (mode === "copy") {
          setVersions(src.languages.map(toEditable));
          setActive(first.language);
          setName(suggestCopyName(src.session_name, all.map((s) => s.session_name)));
        } else {
          const free = LANGUAGES.find((l) => !src.languages.some((v) => v.language === l.code));
          setNewLang(free ? free.code : "other");
          setVersions([toEditable({ ...en, language: free ? free.code : "" })]);
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, mode]);

  // New mode: "Start from" copies every language of an existing session.
  const chooseStart = async (value) => {
    setStartFrom(value);
    setError(null);
    if (!value) {
      setVersions([blankVersion("EN")]);
      setActive("EN");
      return;
    }
    try {
      const src = await api.getRecord("session", value);
      setVersions(src.languages.map(toEditable));
      setActive(src.languages[0].language);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className="app-container">Loading...</p>;
  if (error && id && !source) return <p className="app-container error-text">{error}</p>;

  const batteryByIndex = Object.fromEntries(batteries.map((b) => [b.battery_index, b]));
  const addLangCode = newLang === "other" ? otherLang.trim().toUpperCase() : newLang;
  const found = versions.findIndex((v) => v.language === active);
  const currentIdx = mode === "addLanguage" || found < 0 ? 0 : found;
  const current = versions[currentIdx];
  const updateCurrent = (patch) => setVersions((vs) => vs.map((v, i) => (i === currentIdx ? { ...v, ...patch } : v)));

  const referenceVersion =
    mode === "addLanguage"
      ? source?.languages.find((l) => l.language === copyFrom)
      : current && current.language !== "EN"
      ? versions.find((v) => v.language === "EN")
      : null;

  const addVersion = () => {
    if (!/^[A-Z]{2}$/.test(addLangCode)) return setError("A language code is 2 letters, e.g. ES.");
    if (versions.some((v) => v.language === addLangCode)) return setError(`${addLangCode} is already in this session.`);
    const from = versions.find((v) => v.language === copyFrom) ?? current;
    setVersions((vs) => [...vs, { ...JSON.parse(JSON.stringify(from)), language: addLangCode }]);
    setActive(addLangCode);
    setNewLang("");
    setError(null);
  };

  const removeVersion = () => {
    if (!window.confirm(`Remove ${current.language} from this new session?`)) return;
    const rest = versions.filter((_, i) => i !== currentIdx);
    setVersions(rest);
    setActive(rest[0].language);
  };

  const all = mode === "addLanguage" ? [{ ...versions[0], language: addLangCode }] : versions;
  const checks = all.map((v) => ({ language: v.language, ...checkButtons(v.buttons, batteryByIndex) }));
  const currentCheck = checkButtons(current?.buttons ?? [], batteryByIndex);
  const nameTaken = sessions.some((s) => s.session_name === name.trim());

  const handleSave = async () => {
    setError(null);
    for (const v of all) {
      if (!v.title.trim()) return setError(`${v.language}: the title is empty.`);
      if (v.buttons.length === 0) return setError(`${v.language}: add at least one button.`);
    }
    const blocking = checks.flatMap((c) => c.errors.map((e) => `${c.language}: ${e}`));
    if (blocking.length) return setError(blocking.join(" "));

    setSaving(true);
    try {
      if (mode === "addLanguage") {
        if (!/^[A-Z]{2}$/.test(addLangCode)) throw new Error("A language code is 2 letters, e.g. ES.");
        if (source.languages.some((l) => l.language === addLangCode)) throw new Error(`${addLangCode} already exists.`);
        await api.addSessionLanguage(csrfToken, { sessionId: source.session_id, language: addLangCode, ...forSave(versions[0]) });
        navigate(`/sessions/${source.session_id}?lang=${addLangCode}`);
        return;
      }
      if (!NAME_PATTERN.test(name.trim())) throw new Error("Name may only contain letters, numbers, and underscores.");
      if (nameTaken) throw new Error(`"${name.trim()}" already exists. Existing sessions are never overwritten.`);
      const result = await api.createSession(csrfToken, {
        sessionName: name.trim(),
        languages: Object.fromEntries(versions.map((v) => [v.language, forSave(v)])),
      });
      navigate(`/sessions/${result.session_id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const languagePicker = (existing, withPrompt) => (
    <>
      <select value={newLang} onChange={(e) => setNewLang(e.target.value)}>
        {withPrompt && <option value="">+ Add language...</option>}
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
      ? `Add a language: ${source?.session_name}`
      : mode === "copy"
      ? `Edit as copy: ${source?.session_name}`
      : "New session";

  return (
    <div className="app-container">
      <p>
        <Link to={source ? `/sessions/${source.session_id}` : "/sessions"}>
          ← {source ? `Session ${source.session_name}` : "Sessions"}
        </Link>
      </p>
      <h2>{heading}</h2>

      {mode === "addLanguage" && source && (
        <>
          <p className="hint">
            The new language is added to "{source.session_name}"; its existing languages (
            {source.languages.map((l) => l.language).join(", ")}) stay exactly as they are. Participants who choose this
            language will see this version.
          </p>
          <div className="form-grid">
            <label>
              New language
              <span>{languagePicker(source.languages.map((l) => l.language), false)}</span>
            </label>
            <label>
              Start from
              <select
                value={copyFrom}
                onChange={(e) => {
                  if (!window.confirm(`Start again from ${e.target.value}? Changes so far are replaced.`)) return;
                  setCopyFrom(e.target.value);
                  setVersions([toEditable(source.languages.find((l) => l.language === e.target.value))]);
                }}
              >
                {source.languages.map((l) => (
                  <option key={l.language} value={l.language}>
                    a copy of {languageLabel(l.language)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {mode !== "addLanguage" && (
        <>
          {source && (
            <p className="hint">
              Saved as a <b>new</b> session with all of its languages. "{source.session_name}" stays unchanged; to use the
              new one, point the JATOS study component at the new name.
            </p>
          )}
          <div className="form-grid">
            {mode === "new" && (
              <label>
                Start from
                <select value={startFrom} onChange={(e) => chooseStart(e.target.value)}>
                  <option value="">Blank</option>
                  {sessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      a copy of {s.session_name} ({s.languages.join(", ")})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Session name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. COMM_100" />
              {nameTaken && <span className="error-text">Already exists</span>}
            </label>
          </div>

          <div className="toolbar language-bar">
            <label>
              Language{" "}
              <select value={current?.language} onChange={(e) => setActive(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.language} value={v.language}>
                    {languageLabel(v.language)}
                  </option>
                ))}
              </select>
            </label>
            {languagePicker(versions.map((v) => v.language), true)}
            {newLang && (
              <>
                <label>
                  copied from{" "}
                  <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                    {versions.map((v) => (
                      <option key={v.language} value={v.language}>
                        {v.language}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={addVersion}>
                  Add
                </button>
              </>
            )}
            <span className="nav-spacer" />
            {versions.length > 1 && (
              <button type="button" className="danger" onClick={removeVersion}>
                Remove {current.language}
              </button>
            )}
          </div>
        </>
      )}

      {current && (
        <>
          <div className="form-grid">
            <label>
              Title (shown above the buttons, after "Hello &lt;name&gt;,")
              <input type="text" value={current.title} onChange={(e) => updateCurrent({ title: e.target.value })} />
              {referenceVersion && referenceVersion.title !== current.title && (
                <span className="session-ref">
                  <span className="lang-badge">{referenceVersion.language}</span>
                  {referenceVersion.title}
                </span>
              )}
            </label>
          </div>
          <details className="session-advanced">
            <summary>Advanced: index and name check (kept from the old config file)</summary>
            <div className="form-grid">
              <label>
                Index
                <input
                  type="number"
                  value={current.chooser_index}
                  onChange={(e) => updateCurrent({ chooser_index: e.target.value })}
                />
              </label>
              <label>
                Name check
                <select value={current.run_name_check} onChange={(e) => updateCurrent({ run_name_check: e.target.value })}>
                  <option value="">not set</option>
                  <option value="true">on</option>
                  <option value="false">off</option>
                </select>
              </label>
            </div>
          </details>

          <h3>Buttons</h3>
          <p className="hint">
            <b>Row</b> places the button on the page. <b>Bit</b> is the participant's progress mark: when the button's battery
            is finished, that bit is set and the button shows as done, so each normal button needs its own. <b>Phase</b> and{" "}
            <b>Test</b> are saved with the results. <b>Pick a test</b> lets the participant choose one task from the battery.
          </p>
          <SessionButtonsEditor
            buttons={current.buttons}
            onChange={(buttons) => updateCurrent({ buttons })}
            batteries={batteries}
            batteryByIndex={batteryByIndex}
            reference={referenceVersion?.buttons}
            referenceLanguage={referenceVersion?.language}
          />
          {currentCheck.errors.length > 0 && (
            <ul className="error-text">
              {currentCheck.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {currentCheck.warnings.length > 0 && (
            <details className="warn-text">
              <summary>
                {currentCheck.warnings.length} warning{currentCheck.warnings.length === 1 ? "" : "s"} (saving is still
                allowed)
              </summary>
              <ul>
                {currentCheck.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <h3>Layout preview</h3>
          <SessionPreview title={current.title} buttons={current.buttons} batteryByIndex={batteryByIndex} />
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      <p>
        <button className="primary" onClick={handleSave} disabled={saving || !current}>
          {saving
            ? "Saving..."
            : mode === "addLanguage"
            ? `Add ${addLangCode || "language"} to "${source?.session_name}"`
            : `Save as new session${versions.length > 1 ? ` (${versions.map((v) => v.language).join(", ")})` : ""}`}
        </button>
      </p>
    </div>
  );
}

export default SessionEditor;
