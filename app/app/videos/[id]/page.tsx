'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EntitySummary } from '@/lib/types';
import { VersionFlowCanvas, VersionNode } from '@/components/version-flow-canvas';

export default function VideosPage() {
    const params = useParams();
    const router = useRouter();
    const videoId = (params?.id as string) ?? '';

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [versions, setVersions] = useState<VersionNode[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const isRenderingRef = useRef(false);

    useEffect(() => {
        if (videoId) {
            loadEntity();
            loadVideo();
        }
    }, [videoId]);

    const loadEntity = async () => {
        try {
            const res = await fetch('/api/entities');
            if (res.ok) {
                const entities = await res.json();
                const entity = entities.find((e: EntitySummary) => e.id === videoId);
                if (entity) setCurrentEntity(entity);
                else router.push('/app');
            }
        } catch (e) {
            console.error('Error loading entity:', e);
        }
    };

    const buildVersionNodes = (data: any): VersionNode[] =>
        (data.versions || []).map((v: any) => ({
            id: v.id,
            remotionCode: v.remotionCode,
            title: v.title,
            width: v.width,
            height: v.height,
            timestamp: v.timestamp,
            prompt: v.prompt,
            parentVersionId: v.parentVersionId,
            model: v.model,
            tokenCount: v.tokenCount,
            creditCount: v.creditCount,
            videoUrl: v.videoUrl,
            videoStatus: v.status,
        }));

    const renderVideo = useCallback(async (versionId: string) => {
        if (isRenderingRef.current) return;
        isRenderingRef.current = true;

        setVersions(prev => prev.map(v => v.id === versionId ? { ...v, videoStatus: 'rendering' } : v));

        try {
            await fetch('/api/videos/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId, versionId }),
            });
        } catch (e) {
            console.error('Render error:', e);
        } finally {
            isRenderingRef.current = false;
            const res = await fetch(`/api/videos?videoId=${videoId}`);
            if (res.ok) {
                const data = await res.json();
                setVersions(buildVersionNodes(data));
            }
        }
    }, [videoId]);

    const loadVideo = useCallback(async () => {
        try {
            const res = await fetch(`/api/videos?videoId=${videoId}`);
            if (res.ok) {
                const data = await res.json();
                setVersions(buildVersionNodes(data));

                // Auto-render any version that hasn't been rendered yet
                const versions: any[] = data.versions || [];
                for (const v of versions) {
                    if (v.status !== 'done' && v.status !== 'rendering') {
                        renderVideo(v.id);
                        break; // render one at a time; the next load will pick up the next pending one
                    }
                }
            }
        } catch (e) {
            console.error('Error loading video:', e);
        }
    }, [videoId, renderVideo]);

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
                entityType="video"
                entityId={videoId}
                apiEndpoint={`/api/video-chat?videoId=${encodeURIComponent(videoId)}`}
                onUpdate={loadVideo}
                isGenerating={isGenerating}
                onGeneratingChange={setIsGenerating}
            />
        </div>
    );
}
