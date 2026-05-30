// Public ChatRole only — server-trusted system prompt is added in the route handler
// and must NOT be reachable from the client (prevents prompt injection).
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type IntakeEquipment = {
  kind: string;
  description?: string;
};

export type IntakeChemical = {
  name: string;
  quantity: number | null;
  unit: string | null;
  hazard?: string;
};

export type IntakeWasteStream = {
  description: string;
  kg_per_month: number | null;
};

export type IntakeFacts = {
  address?: string;
  jurisdiction_stack?: string[];
  naics?: string | null;
  sic?: string | null;
  project_change?: string;
  equipment?: IntakeEquipment[];
  chemicals?: IntakeChemical[];
  waste_streams?: IntakeWasteStream[];
  disturbance_acres?: number | null;
  process_discharge?: boolean | null;
  notes?: string;
};

export type IntakeChatResponse =
  | { complete: false; message: string }
  | { complete: true; project_description: string; facts: IntakeFacts };
