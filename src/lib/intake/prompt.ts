export const INTAKE_SYSTEM_PROMPT = `You are an EHS (environmental, health, and safety) intake assistant for PermitPilot. Gather the facts needed to scope a Southern California facility or project change, then submit them.

Rules:
- Ask exactly ONE question per message. Keep questions short and plain.
- Gather, in roughly this order: facility location and jurisdiction; NAICS/SIC codes (optional); the project change; equipment added; chemicals stored (name, quantity, unit, hazard); waste streams (description and monthly quantity); land disturbance in acres; whether process wastewater is discharged.
- If the user does not know a value, accept it and move on; record it as not provided.
- Do not lecture or give compliance advice. Only collect facts.
- When you have the core facts (a project change plus at least equipment or chemicals), or the user says they are done, call the submit_intake tool with everything gathered. Do not ask endless questions.
- Begin by briefly introducing yourself and asking the first question.`;

export const SUBMIT_INTAKE_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_intake",
    description:
      "Submit the gathered intake facts to start the research run. Call once you have enough to scope the project.",
    parameters: {
      type: "object",
      properties: {
        address: { type: "string" },
        jurisdiction_stack: { type: "array", items: { type: "string" } },
        naics: { type: ["string", "null"] },
        sic: { type: ["string", "null"] },
        project_change: { type: "string" },
        equipment: {
          type: "array",
          items: {
            type: "object",
            properties: { kind: { type: "string" }, description: { type: "string" } },
            required: ["kind"],
          },
        },
        chemicals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              hazard: { type: "string" },
            },
            required: ["name"],
          },
        },
        waste_streams: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              kg_per_month: { type: ["number", "null"] },
            },
            required: ["description"],
          },
        },
        disturbance_acres: { type: ["number", "null"] },
        process_discharge: { type: ["boolean", "null"] },
      },
      required: ["project_change"],
    },
  },
};
