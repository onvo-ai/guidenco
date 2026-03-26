'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EntitySummary } from '@/lib/types';
import { VersionFlowCanvas, VersionNode } from '@/components/version-flow-canvas';

export default function BlogArticlePage() {
  const params = useParams();
  const router = useRouter();
  const articleId = (params?.id as string) ?? '';

  const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
  const [versions, setVersions] = useState<VersionNode[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (articleId) {
      loadEntity();
      loadArticle();
    }
  }, [articleId]);

  const loadEntity = async () => {
    try {
      const res = await fetch('/api/entities');
      if (res.ok) {
        const entities = await res.json();
        const entity = entities.find((e: EntitySummary) => e.id === articleId);
        if (entity) setCurrentEntity(entity);
        else router.push('/app');
      }
    } catch (e) {
      console.error('Error loading entity:', e);
    }
  };

  const loadArticle = useCallback(async () => {
    try {
      const res = await fetch(`/api/blog-articles?articleId=${articleId}`);
      if (res.ok) {
        const data = await res.json();
        const vs: VersionNode[] = (data.versions || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          content: v.content,
          bannerImage: v.bannerImage,
          tags: v.tags,
          timestamp: v.timestamp,
          prompt: v.prompt,
          parentVersionId: v.parentVersionId,
        }));
        setVersions(vs);
      }
    } catch (e) {
      console.error('Error loading article:', e);
    }
  }, [articleId]);

  if (!currentEntity) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <VersionFlowCanvas
        versions={versions}
        entityType="blog_article"
        entityId={articleId}
        apiEndpoint={`/api/blog-chat?articleId=${encodeURIComponent(articleId)}`}
        onUpdate={loadArticle}
        isGenerating={isGenerating}
        onGeneratingChange={setIsGenerating}
      />
    </div>
  );
}
