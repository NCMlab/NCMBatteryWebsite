import * as api from "../api";

// Parameter sets and instruction sets share the list page (ConfigLibrary); this table
// holds everything that differs between the two. Parameter sets also share the view and
// editor pages; instruction sets have their own (InstructionSetView/InstructionSetEditor),
// because each set holds several languages.
export const KINDS = {
  parameter: {
    label: "parameter set",
    title: "Parameter sets",
    idKey: "parameter_id",
    nameKey: "parameter_name",
    bodyKey: "parameters",
    list: api.listParameters,
    create: (csrfToken, { taskTypeId, name, language, body }) =>
      api.createParameter(csrfToken, { taskTypeId, parameterName: name, language, parameters: body }),
    // task_parameters is unique on (task_type_id, parameter_name) -- language is not part of it.
    sameNameSpace: (row, taskTypeId) => row.task_type_id === taskTypeId,
    languageHeader: "Lang",
    languagesOf: (row) => row.language,
  },
  instruction: {
    label: "instruction set",
    title: "Instruction sets",
    idKey: "instruction_set_id",
    nameKey: "instruction_name",
    list: api.listInstructions,
    languageHeader: "Languages",
    languagesOf: (row) => row.languages.join(", "),
  },
};
