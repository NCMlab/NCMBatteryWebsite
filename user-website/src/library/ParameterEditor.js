import React, { useEffect, useState } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { getDefaultFormState } from "@rjsf/utils";

/**
 * Edits a parameter set as a form -- Yes/No radios, pull-downs, number boxes, lists with
 * Add/Remove buttons -- built from the task type's parameter schema (task_types.parameter_schema,
 * from NCMBattery's MySQL/ConfigurationDatabase/schemas/). There is no JSON editing: every task
 * type with parameter sets has a schema, and a task type without one shows a message instead.
 *
 * The parent owns the parameter object as JSON *text* (so ConfigEditor and FormSettings can keep
 * it in state as before); this component parses it for the form and writes it back on change.
 */

/** Label and help text laid out like react-jsonschema-form's own fields. */
function FieldShell({ schema, name, required, children, problem }) {
  return (
    <div className="form-group">
      <label className="control-label">
        {schema.title || name}
        {required && <span className="required">*</span>}
      </label>
      {children}
      {schema.description && <p className="field-description">{schema.description}</p>}
      {problem && <span className="error-text">{problem}</span>}
    </div>
  );
}

/** A size that some sets store as a number (400) and others as CSS text ("400vw"). */
function NumberOrTextField({ formData, onChange, schema, name, required, readonly, disabled }) {
  const handle = (text) => onChange(/^-?\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : text);
  return (
    <FieldShell schema={schema} name={name} required={required}>
      <input
        type="text"
        className="form-control"
        value={formData ?? ""}
        readOnly={readonly || disabled}
        onChange={(e) => handle(e.target.value)}
      />
    </FieldShell>
  );
}

/** Text that existing sets leave as an empty list when unused (Questionnaire "variable"). */
function OptionalTextField({ formData, onChange, schema, name, required, readonly, disabled }) {
  const text = typeof formData === "string" ? formData : "";
  return (
    <FieldShell schema={schema} name={name} required={required}>
      <input
        type="text"
        className="form-control"
        value={text}
        readOnly={readonly || disabled}
        onChange={(e) => onChange(e.target.value === "" ? [] : e.target.value)}
      />
    </FieldShell>
  );
}

const listText = (v) => (Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v));

/** A list of numbers typed as "10000, 8000" (one old set stores a single number instead). */
function NumberListField({ formData, onChange, schema, name, required, readonly, disabled }) {
  const [text, setText] = useState(listText(formData));
  const [problem, setProblem] = useState(null);
  // Follow outside changes without reformatting what is being typed.
  useEffect(() => {
    setText((current) => {
      const typed = current.split(",").map((x) => x.trim()).filter(Boolean).map(Number).join(", ");
      return typed === listText(formData) ? current : listText(formData);
    });
  }, [formData]);

  const handle = (value) => {
    setText(value);
    const parts = value.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.some((x) => !/^\d+$/.test(x))) {
      setProblem("Whole numbers only, separated by commas.");
      return;
    }
    setProblem(null);
    onChange(parts.map(Number));
  };
  return (
    <FieldShell schema={schema} name={name} required={required} problem={problem}>
      <input
        type="text"
        className="form-control"
        value={text}
        readOnly={readonly || disabled}
        onChange={(e) => handle(e.target.value)}
        placeholder="e.g. 10000, 8000"
      />
    </FieldShell>
  );
}

/** Fallback for a schema field still marked "json": shown, but not editable here. */
function NotEditableField({ formData, schema, name }) {
  return (
    <FieldShell schema={schema} name={name}>
      <div className="hint">
        {formData === undefined ? "(not set)" : JSON.stringify(formData)} — this setting has no form control yet.
      </div>
    </FieldShell>
  );
}

const FIELDS = {
  numberOrText: NumberOrTextField,
  optionalText: OptionalTextField,
  numberList: NumberListField,
  json: NotEditableField,
};

function withCatchAllOrder(uiSchema) {
  const order = uiSchema?.["ui:order"];
  if (!order || order.includes("*")) return uiSchema;
  return { ...uiSchema, "ui:order": [...order, "*"] }; // fields the schema doesn't list go last
}

/** Errors for a parameter object against the task's schema; [] when there is no schema. */
export function validateParameters(schemaDef, value) {
  if (!schemaDef) return [];
  return (
    validator
      .validateFormData(value, schemaDef.schema)
      .errors // a pull-down (oneOf) value error repeats once per option, and a per-method rule
      // (if/then) adds a generic "must match then schema"; the specific error is reported anyway
      .filter((e) => e.name !== "const" && e.name !== "if")
      .map((e) => (e.name === "oneOf" ? `${e.stack.split("'")[1] || e.property} must be one of the listed choices` : e.stack))
  );
}

/** A starting parameter object filled with the schema's defaults (for "new from scratch"). */
export function defaultParameters(schemaDef) {
  if (!schemaDef) return {};
  return getDefaultFormState(validator, schemaDef.schema, {});
}

function ParameterEditor({ schemaDef, text, onChange, readOnly = false }) {
  if (!schemaDef) {
    return (
      <p className="warn-text">
        This task type has no parameter form, so its settings can't be edited here. Ask for a form to be added
        (NCMBattery: MySQL/ConfigurationDatabase/schemas/).
      </p>
    );
  }

  let formData = {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) formData = value;
  } catch {
    // stays empty
  }

  return (
    <div className="parameter-editor">
      {!schemaDef.reviewed && (
        <p className="warn-text">
          Draft form: settings marked CHECK don't work the way their names suggest; see their help text.
        </p>
      )}
      <Form
        schema={schemaDef.schema}
        uiSchema={withCatchAllOrder(schemaDef.uiSchema)}
        formData={formData}
        validator={validator}
        fields={FIELDS}
        readonly={readOnly}
        liveValidate
        showErrorList={false}
        onChange={({ formData }) => onChange(JSON.stringify(formData, null, 2))}
      >
        <></>
      </Form>
    </div>
  );
}

export default ParameterEditor;
