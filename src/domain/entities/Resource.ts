export interface Resource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface ResourceAction {
  resource: Resource;
  action: string;
}
