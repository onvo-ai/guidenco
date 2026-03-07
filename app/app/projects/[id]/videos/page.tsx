'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function VideosPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    if (params.id) {
      router.replace(`/app/videos/${params.id}`);
    }
  }, [params.id, router]);

  return null;
}
