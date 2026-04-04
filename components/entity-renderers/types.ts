export interface VersionNode {
  id: string;
  prompt?: string;
  parentVersionId?: string;
  timestamp: number;
  // Asset
  svgContent?: string;
  title?: string;
  width?: number;
  height?: number;
  // Video
  remotionCode?: string;
  videoUrl?: string;
  videoStatus?: string; // 'pending' | 'rendering' | 'done' | 'error'
  // Blog
  content?: string;
  bannerImage?: string | null;
  tags?: string[];
  // Social
  platform?: string;
  hashtags?: string[];
  mediaUrl?: string | null;
  // Document
  html?: string;
  googleFonts?: string[];
  // Experiment
  metric?: string;
  parameters?: { id: string; value: string }[];
  // Usage
  tokenCount?: number;
  creditCount?: number;
  model?: string;
  // Generation status
  status?: string; // 'generating' | 'done' | 'error'
}

export type EntityType = 'asset' | 'video' | 'blog_article' | 'social_post' | 'document';

export interface NodeContentProps {
  version: VersionNode;
  docWidth?: number;
  docHeight?: number;
}

export interface DetailContentProps {
  version: VersionNode;
  docWidth?: number;
  docHeight?: number;
}

export interface EntityRenderer {
  NodeContent: React.FC<NodeContentProps>;
  DetailContent: React.FC<DetailContentProps>;
  HeaderActions?: React.FC<{ version: VersionNode }>;
  hasError: (version: VersionNode) => boolean;
  getDownload?: (version: VersionNode) => (() => void) | undefined;
}
