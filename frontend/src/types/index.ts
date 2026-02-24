export type User = {
  id: number;
  username: string;
  roles: string[];
  is_admin: boolean;
};

export type FormField = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
  unit?: string;
  inject?: string;
  tab?: string;
  lookback?: boolean;
  validity_window?: number;
};

export type FormSchema = {
  form_name: string;
  role: string;
  fields: FormField[];
  tabs?: string[];
};

export type AuditLog = {
  id: number;
  form_name: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: number | null;
  changed_by_name?: string | null;
};

export type LdxFileInfo = {
  name: string;
  size: number;
  modified_at: string;
};

export type PaginatedAuditLog = {
  items: AuditLog[];
  total: number;
};

export type InjectionLogEntry = {
  field_id: string;
  value: string;
  was_update: boolean;
  injected_at: string;
};

export type LdxFileStats = {
  file_name: string;
  total: number;
  updates: number;
  static: number;
};
