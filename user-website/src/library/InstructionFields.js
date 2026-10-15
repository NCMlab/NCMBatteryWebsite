import React, { useState } from "react";

/**
 * Edits one language of an instruction set as labelled text boxes instead of raw JSON.
 *
 * There is no per-task schema: the form is built from the JSON itself. Strings become
 * text boxes, lists become numbered items that can be added, removed and reordered,
 * objects become groups. Almost every instruction field is either text or a list of
 * pages ([{ "page": "..." }]), so this covers every task without writing a form for each.
 *
 * `reference` is the same set in another language (normally EN). When given, each text
 * box shows that language's text above it, for translating.
 */

// Keys whose values are identifiers the task code relies on, never translated text
// (e.g. the Intake Form question "name" becomes the data column name).
const CODE_KEYS = new Set(["name", "type", "input_type", "id", "language", "lang"]);
const FILE_VALUE = /(^|\/)assets\/|^https?:\/\/|\.(wav|mp3|ogg|m4a|png|jpe?g|gif|svg|json|js|html?)$/i;
const FILE_KEY = /Folder|File|Audio|Path|Url|Image|Icon/;
const HAS_HTML = /<[a-z][^>]*>/i;

/** "ForwardAudioInstructions" -> "Forward Audio Instructions", "Instructions01" -> "Instructions 01". */
export function humanize(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isCode(key, value) {
  if (typeof value !== "string") return false;
  if (CODE_KEYS.has(key)) return true;
  return FILE_VALUE.test(value.trim()) || (FILE_KEY.test(String(key)) && !/\s/.test(value.trim()));
}

const isPage = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "page" in v;
const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * Strips anything that could run code from instruction HTML before previewing it inside
 * the admin site (scripts, event handlers, javascript: links). Formatting stays.
 */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta, base, form").forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const isUrl = ["href", "src", "xlink:href", "action", "formaction"].includes(name);
      if (name.startsWith("on") || (isUrl && /^\s*(javascript|data|vbscript):/i.test(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

/** An empty value with the same shape as `v`, for "Add page/item" (text emptied, settings kept). */
function blankLike(v) {
  if (typeof v === "string" || v === null) return "";
  if (Array.isArray(v)) return v.length && isPage(v[0]) ? [{ page: "" }] : [];
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, isCode(k, x) ? x : blankLike(x)]));
  return v; // numbers and booleans keep their value
}

/** Top-level keys of `reference` that `value` lacks, and lists whose length differs. */
export function compareWithReference(value, reference) {
  if (!reference || !value) return { missing: [], lengthDiffs: [] };
  const missing = Object.keys(reference).filter((k) => !(k in value));
  const lengthDiffs = Object.keys(reference)
    .filter((k) => k in value && Array.isArray(reference[k]) && Array.isArray(value[k]))
    .filter((k) => reference[k].length !== value[k].length)
    .map((k) => ({ key: k, reference: reference[k].length, value: value[k].length }));
  return { missing, lengthDiffs };
}

function textRows(text) {
  const lines = String(text ?? "").split("\n");
  const wrapped = lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 90)), 0);
  return Math.min(14, Math.max(2, wrapped));
}

function Preview({ html }) {
  return <div className="instr-preview" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

function Reference({ text, language }) {
  if (typeof text !== "string") return null;
  return (
    <div className="instr-ref" title={`${language} text`}>
      <span className="lang-badge">{language}</span>
      {text === "" ? <i>(empty)</i> : text}
    </div>
  );
}

function TextField({ fieldKey, label, value, refValue, ctx, onChange }) {
  const code = isCode(fieldKey, value);
  const text = value ?? "";
  const showRef = ctx.reference && !code && refValue !== undefined;

  if (ctx.readOnly) {
    return (
      <div className="instr-field">
        {label && <div className="instr-label">{label}</div>}
        {code ? (
          <code className="instr-code">{text}</code>
        ) : text === "" ? (
          <i className="hint">(empty)</i>
        ) : (
          <Preview html={text} />
        )}
        {showRef && <Reference text={refValue} language={ctx.referenceLanguage} />}
      </div>
    );
  }

  const single = code || (!text.includes("\n") && text.length < 60 && !HAS_HTML.test(text));
  return (
    <div className="instr-field">
      {label && (
        <div className="instr-label">
          {label}
          {code && <span className="code-badge" title="Used by the task code; normally not translated">code</span>}
        </div>
      )}
      {showRef && <Reference text={refValue} language={ctx.referenceLanguage} />}
      {single ? (
        <input
          type="text"
          className={code ? "instr-code" : ""}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={!code}
        />
      ) : (
        <textarea value={text} rows={textRows(text)} onChange={(e) => onChange(e.target.value)} />
      )}
      {ctx.showPreview && !code && HAS_HTML.test(text) && <Preview html={text} />}
    </div>
  );
}

function ListField({ label, value, refValue, ctx, onChange }) {
  const pages = value.length > 0 && value.every(isPage);
  const itemWord = pages ? "Page" : "Item";
  const refList = Array.isArray(refValue) ? refValue : undefined;

  const update = (i, item) => onChange(value.map((x, j) => (j === i ? item : x)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const move = (i, d) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const add = () => {
    const last = value[value.length - 1];
    onChange([...value, value.length ? blankLike(last) : { page: "" }]);
  };

  return (
    <fieldset className="instr-group">
      {label && <legend>{label}</legend>}
      {refList && refList.length !== value.length && (
        <p className="warn-text">
          {ctx.referenceLanguage} has {refList.length} {itemWord.toLowerCase()}
          {refList.length === 1 ? "" : "s"}, this has {value.length}.
        </p>
      )}
      {value.map((item, i) => (
        <div className="instr-item" key={i}>
          <div className="instr-item-head">
            <span className="instr-item-label">
              {itemWord} {i + 1}
            </span>
            {!ctx.readOnly && (
              <span className="instr-item-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} title="Move down">
                  ↓
                </button>
                <button type="button" onClick={() => remove(i)} title={`Remove ${itemWord.toLowerCase()}`}>
                  ✕
                </button>
              </span>
            )}
          </div>
          {isPage(item) ? (
            <TextField
              fieldKey="page"
              value={item.page}
              refValue={isPage(refList?.[i]) ? refList[i].page : undefined}
              ctx={ctx}
              onChange={(page) => update(i, { ...item, page })}
            />
          ) : (
            <Field fieldKey={null} value={item} refValue={refList?.[i]} ctx={ctx} onChange={(v) => update(i, v)} />
          )}
        </div>
      ))}
      {value.length === 0 && <p className="hint">(none)</p>}
      {!ctx.readOnly && (
        <button type="button" onClick={add}>
          + Add {itemWord.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}

function ObjectField({ label, value, refValue, ctx, onChange }) {
  const body = Object.entries(value).map(([k, v]) => (
    <Field
      key={k}
      fieldKey={k}
      label={humanize(k)}
      value={v}
      refValue={isPlainObject(refValue) ? refValue[k] : undefined}
      ctx={ctx}
      onChange={(next) => onChange({ ...value, [k]: next })}
    />
  ));
  if (!label) return <div className="instr-object">{body}</div>;
  return (
    <fieldset className="instr-group">
      <legend>{label}</legend>
      {body}
    </fieldset>
  );
}

function Field({ fieldKey, label, value, refValue, ctx, onChange }) {
  if (Array.isArray(value)) return <ListField label={label} value={value} refValue={refValue} ctx={ctx} onChange={onChange} />;
  if (isPlainObject(value)) return <ObjectField label={label} value={value} refValue={refValue} ctx={ctx} onChange={onChange} />;
  if (typeof value === "boolean") {
    return (
      <div className="instr-field">
        <label className="instr-check">
          <input type="checkbox" checked={value} disabled={ctx.readOnly} onChange={(e) => onChange(e.target.checked)} />{" "}
          {label}
        </label>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <div className="instr-field">
        {label && <div className="instr-label">{label}</div>}
        <input
          type="number"
          value={value}
          readOnly={ctx.readOnly}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      </div>
    );
  }
  return <TextField fieldKey={fieldKey} label={label} value={value} refValue={refValue} ctx={ctx} onChange={onChange} />;
}

function AddField({ value, onChange }) {
  const [key, setKey] = useState("");
  const [kind, setKind] = useState("pages");
  const taken = key.trim() in value;
  const valid = /^[A-Za-z][A-Za-z0-9_]*$/.test(key.trim()) && !taken;
  const add = () => {
    onChange({ ...value, [key.trim()]: kind === "pages" ? [{ page: "" }] : "" });
    setKey("");
  };
  return (
    <div className="instr-add-field">
      <span>Add a field:</span>
      <input type="text" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. WelcomeText" />
      <select value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="pages">List of pages</option>
        <option value="text">Text</option>
      </select>
      <button type="button" onClick={add} disabled={!valid}>
        Add
      </button>
      {taken && <span className="error-text">Already exists</span>}
    </div>
  );
}

function InstructionFields({ value, onChange = () => {}, reference = null, referenceLanguage = "EN", readOnly = false }) {
  const [showPreview, setShowPreview] = useState(false);
  const ctx = { reference, referenceLanguage, readOnly, showPreview };
  const { missing } = compareWithReference(value, reference);

  return (
    <div className="instruction-fields">
      {!readOnly && (
        <label className="instr-preview-toggle">
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} /> Show
          formatted preview under text that contains HTML (bold, line breaks, colours)
        </label>
      )}
      {missing.length > 0 && (
        <div className="warn-box">
          <b>
            Missing compared with {referenceLanguage}: {missing.map(humanize).join(", ")}.
          </b>
          {!readOnly && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onChange({ ...value, ...Object.fromEntries(missing.map((k) => [k, reference[k]])) })}
              >
                Copy them from {referenceLanguage}
              </button>
            </>
          )}
        </div>
      )}
      <ObjectField value={value} refValue={reference} ctx={ctx} onChange={onChange} />
      {Object.keys(value).length === 0 && <p className="hint">No fields yet.</p>}
      {!readOnly && <AddField value={value} onChange={onChange} />}
    </div>
  );
}

export default InstructionFields;
