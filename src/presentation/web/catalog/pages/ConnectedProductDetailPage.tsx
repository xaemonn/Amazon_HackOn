import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useCatalog } from '../CatalogContext';
import { ProductDetailPage } from './ProductDetailPage';
import type { ProductDetailData, VariantData, DeliveryEstimate } from './ProductDetailPage';

export function ConnectedProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { getProductById, getVariants, getDeliveryEstimate, ready } = useCatalog();

  const [product, setProduct] = useState<ProductDetailData | null>(null);
  const [variants, setVariants] = useState<VariantData[]>([]);
  const [deliveryEstimate, setDeliveryEstimate] = useState<DeliveryEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'not_found' | 'network_error' | null>(null);

  const loadProduct = useCallback(async () => {
    if (!ready || !id) return;

    setLoading(true);
    setError(null);

    try {
      const [prod, vars, delivery] = await Promise.all([
        getProductById(id),
        getVariants(id),
        getDeliveryEstimate(),
      ]);

      if (!prod) {
        setError('not_found');
        setProduct(null);
        setVariants([]);
        setDeliveryEstimate(null);
      } else {
        setProduct({
          id: prod.id,
          title: prod.title,
          brand: prod.brand,
          catalogImageUrl: prod.catalogImageUrl,
          category: prod.category,
          basePrice: prod.basePrice,
          fitMetadata: prod.fitMetadata,
        });
        setVariants(
          vars.map((v) => ({
            id: v.id,
            productId: v.productId,
            condition: v.condition,
            price: v.price,
            stock: v.stock,
            sourceReturnId: v.sourceReturnId,
            conditionReport: v.conditionReport,
            unitPhotos: v.unitPhotos?.map((p) => ({ id: p.id, storageKey: p.storageKey })),
          }))
        );
        setDeliveryEstimate({
          earliestDate: delivery.earliestDate,
          latestDate: delivery.latestDate,
          displayText: delivery.displayText,
        });
      }
    } catch {
      setError('network_error');
    } finally {
      setLoading(false);
    }
  }, [ready, id, getProductById, getVariants, getDeliveryEstimate]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  return (
    <ProductDetailPage
      product={product}
      variants={variants}
      deliveryEstimate={deliveryEstimate}
      loading={loading}
      error={error}
      onRetry={loadProduct}
    />
  );
}
