export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ArtworkVersion {
  html: string;
  timestamp: number;
}

export interface ArtworkState {
  width: number;
  height: number;
  versions: ArtworkVersion[];
  currentVersion: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: any[];
}
