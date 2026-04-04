export interface EntitySummary {
  id: string;
  name: string;
  type: 'document' | 'asset' | 'video' | 'blog_article' | 'social_post';
  createdAt: number;
  updatedAt: number;
}

export interface DocumentVersion {
  html: string;
  timestamp: number;
}

export interface DocumentState {
  width: number;
  height: number;
  versions: DocumentVersion[];
  currentVersion: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: any[];
}
