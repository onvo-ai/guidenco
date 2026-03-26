'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EntitySummary } from '@/lib/types';
import { VersionFlowCanvas, VersionNode } from '@/components/version-flow-canvas';

export default function AssetsPage() {
    const params = useParams();
    const router = useRouter();
    const assetId = (params?.id as string) ?? '';

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [versions, setVersions] = useState<VersionNode[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (assetId) {
            loadEntity();
            loadAsset();
        }
    }, [assetId]);

    const loadEntity = async () => {
        try {
            const res = await fetch('/api/entities');
            if (res.ok) {
                const entities = await res.json();
                const entity = entities.find((e: EntitySummary) => e.id === assetId);
                if (entity) setCurrentEntity(entity);
                else router.push('/app');
            }
        } catch (e) {
            console.error('Error loading entity:', e);
        }
    };

    const loadAsset = useCallback(async () => {
        try {
            const res = await fetch(`/api/asset-generations?assetId=${assetId}`);
            if (res.ok) {
                const data = await res.json();
                const vs: VersionNode[] = (data.versions || []).map((v: any) => ({
                    id: v.id,
                    svgContent: v.svgContent,
                    title: v.title,
                    width: v.width,
                    height: v.height,
                    timestamp: v.timestamp,
                    prompt: v.prompt,
                    parentVersionId: v.parentVersionId,
                    model: v.model,
                    tokenCount: v.tokenCount,
                    creditCount: v.creditCount,
                }));
                setVersions(vs);
            }
        } catch (e) {
            console.error('Error loading asset:', e);
        }
    }, [assetId]);

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
                entityType="asset"
                entityId={assetId}
                apiEndpoint={`/api/asset-chat?assetId=${encodeURIComponent(assetId)}`}
                onUpdate={loadAsset}
                isGenerating={isGenerating}
                onGeneratingChange={setIsGenerating}
            />
        </div>
    );
}
