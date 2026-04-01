'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EntitySummary } from '@/lib/types';
import { VersionFlowCanvas, VersionNode } from '@/components/version-flow-canvas';

export default function DocumentPage() {
    const params = useParams();
    const router = useRouter();
    const documentId = (params?.id as string) ?? '';

    const [currentEntity, setCurrentEntity] = useState<EntitySummary | null>(null);
    const [versions, setVersions] = useState<VersionNode[]>([]);
    const [docWidth, setDocWidth] = useState(800);
    const [docHeight, setDocHeight] = useState(600);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (documentId) {
            loadEntity();
            loadDocument();
        }
    }, [documentId]);

    const loadEntity = async () => {
        try {
            const res = await fetch('/api/entities');
            if (res.ok) {
                const entities = await res.json();
                const entity = entities.find((e: EntitySummary) => e.id === documentId);
                if (entity) setCurrentEntity(entity);
                else router.push('/app');
            }
        } catch (e) {
            console.error('Error loading entity:', e);
        }
    };

    const loadDocument = useCallback(async () => {
        try {
            const res = await fetch(`/api/document-versions?documentId=${documentId}`);
            if (res.ok) {
                const data = await res.json();
                setDocWidth(data.width ?? 800);
                setDocHeight(data.height ?? 600);
                const vs: VersionNode[] = (data.versions || []).map((v: any) => ({
                    id: v.id,
                    html: v.html,
                    googleFonts: v.googleFonts || [],
                    timestamp: v.timestamp,
                    prompt: v.prompt,
                    parentVersionId: v.parentVersionId,
                    model: v.model,
                    status: v.status,
                }));
                setVersions(vs);
            }
        } catch (e) {
            console.error('Error loading document:', e);
        }
    }, [documentId]);

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
                entityType="document"
                entityId={documentId}
                apiEndpoint={`/api/document-chat?documentId=${encodeURIComponent(documentId)}`}
                onUpdate={loadDocument}
                isGenerating={isGenerating}
                onGeneratingChange={setIsGenerating}
                docWidth={docWidth}
                docHeight={docHeight}
            />
        </div>
    );
}
