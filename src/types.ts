export interface FileItem {
  name: string;
  isDirectory: boolean;
}

export interface WSMessage {
  id?: string;
  type: string;
  role?: "pc" | "phone";
  code?: string;
  actionType?: string;
  pathParts?: string[];
  name?: string;
  oldName?: string;
  newName?: string;
  content?: string;
  isDirectory?: boolean;
  filename?: string;
  mimeType?: string;
  success?: boolean;
  data?: any;
  error?: string;
}

export interface StatusMessage {
  type: "status";
  pcConnected: boolean;
  phoneCount: number;
}
