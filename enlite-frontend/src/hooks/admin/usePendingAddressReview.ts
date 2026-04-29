import { useState, useEffect, useCallback } from 'react';
import {
  AdminVacancyAddressApiService,
  type ResolveAddressBody,
} from '@infrastructure/http/AdminVacancyAddressApiService';
import type { PendingAddressReviewItem } from '@domain/entities/PatientAddress';

interface UsePendingAddressReviewReturn {
  items: PendingAddressReviewItem[];
  loading: boolean;
  error: string | null;
  activeItem: PendingAddressReviewItem | null;
  fetchItems: (statusFilter?: string) => Promise<void>;
  openReview: (item: PendingAddressReviewItem) => void;
  closeReview: () => void;
  resolve: (body: ResolveAddressBody) => Promise<void>;
}

export function usePendingAddressReview(): UsePendingAddressReviewReturn {
  const [items, setItems] = useState<PendingAddressReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<PendingAddressReviewItem | null>(null);

  const fetchItems = useCallback(async (statusFilter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await AdminVacancyAddressApiService.listPendingAddressReview(statusFilter);
      setItems(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar vacantes pendientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const openReview = useCallback((item: PendingAddressReviewItem) => {
    setActiveItem(item);
  }, []);

  const closeReview = useCallback(() => {
    setActiveItem(null);
  }, []);

  const resolve = useCallback(
    async (body: ResolveAddressBody) => {
      if (!activeItem) return;
      await AdminVacancyAddressApiService.resolveAddressReview(activeItem.id, body);
      setItems(prev => prev.filter(it => it.id !== activeItem.id));
      setActiveItem(null);
    },
    [activeItem],
  );

  return { items, loading, error, activeItem, fetchItems, openReview, closeReview, resolve };
}
