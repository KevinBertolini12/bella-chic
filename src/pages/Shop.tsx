import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, ShoppingBag } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { storeService } from '../services/storeService';
import { Product } from '../types';
import { useCart } from '../contexts/CartContext';
import { useSalon } from '../contexts/SalonContext';
import { useSettings } from '../contexts/SettingsContext';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { SEO } from '../components/SEO';

const ShopSkeleton = () => (
  <div className="container mx-auto px-4 py-12">
    <div className="mb-12 space-y-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-4 w-56" />
    </div>
    <div className="mb-8 flex gap-4">
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-10 w-32" />
    </div>
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-[3/4] w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  </div>
);

export const Shop = () => {
  const { salonId, salon } = useSalon();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'name'>('default');
  const [currentImageIndex, setCurrentImageIndex] = useState<Record<string, number>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({}); // productId -> variantId

  useEffect(() => {
    if (!salonId) return;
    storeService
      .getProducts(salonId)
      .then(setProducts)
      .catch(() => toast.error('Erro ao carregar produtos.'))
      .finally(() => setLoading(false));
  }, [salonId]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return cats.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchesSearch =
        searchTerm === '' ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
    return [...filtered].sort((a, b) => {
      const priceA = a.promotionalPrice || a.price;
      const priceB = b.promotionalPrice || b.price;
      if (sortBy === 'price_asc') return priceA - priceB;
      if (sortBy === 'price_desc') return priceB - priceA;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [products, searchTerm, activeCategory, sortBy]);

  const shopName = settings?.branding?.name
    ? `${settings.branding.name}`
    : salon?.name || 'Boutique';

  const shopSlogan = settings?.branding?.slogan || 'Peças exclusivas selecionadas para você.';

  const handleImageClick = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const product = products.find(p => p.id === productId);
    if (product && (product.images ?? []).length > 1) {
      setCurrentImageIndex(prev => ({
        ...prev,
        [productId]: ((prev[productId] || 0) + 1) % (product.images ?? []).length,
      }));
    }
  };

  if (loading) return <ShopSkeleton />;

  return (
    <>
      <SEO title="Loja" description="Confira nossos produtos" />
      <div className="container mx-auto px-4 py-12">
        {/* Cabeçalho */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{shopName}</h1>
            <p className="mt-1 text-muted-foreground">{shopSlogan}</p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Filtros por categoria */}
        {categories.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              onClick={() => setActiveCategory('all')}
            >
              Todos
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={activeCategory === cat ? 'default' : 'outline'}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        )}

        {/* Grid de produtos */}
        {/* Sort selector */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">{filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}</p>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="default">Ordenar: Padrão</option>
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
            <option value="name">Nome A-Z</option>
          </select>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-20 text-center">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-xl font-medium">Nenhum produto encontrado</h3>
            <p className="text-muted-foreground">Tente buscar por outro termo ou categoria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const currentIdx = currentImageIndex[product.id] || 0;
              const currentImage = product.images[currentIdx];
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -4 }}
                >
                  <Card className="overflow-hidden border-none shadow-md transition-shadow hover:shadow-xl">
                    <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                      {(product.images ?? []).length > 0 ? (
                        <>
                          <img
                            src={currentImage}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                            onClick={(e) => handleImageClick(product.id, e)}
                          />
                          {(product.images ?? []).length > 1 && (
                            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                              {(product.images ?? []).map((_, idx) => (
                                <button
                                  key={idx}
                                  className={`h-1.5 w-1.5 rounded-full ${idx === currentIdx ? 'bg-primary' : 'bg-white/50'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex(prev => ({ ...prev, [product.id]: idx }));
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><ShoppingBag className="h-8 w-8 text-muted-foreground" /></div>
                      )}
                    </div>

                    <CardHeader className="p-4 pb-0">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {product.category}
                      </span>
                      <CardTitle className="mt-1 text-lg leading-tight">{product.name}</CardTitle>
                    </CardHeader>

                    <CardContent className="p-4 pt-2">
                      <div className="flex items-baseline gap-2">
                        {product.promotionalPrice ? (
                          <>
                            <span className="text-xl font-bold text-primary">
                              R$ {product.promotionalPrice.toFixed(2)}
                            </span>
                            <span className="text-sm text-muted-foreground line-through">
                              R$ {(product.price ?? 0).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <span className="text-xl font-bold text-primary">
                            R$ {(product.price ?? 0).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Variant selector */}
                      {product.variants?.length > 0 && (
                        <div className="mt-2">
                          <select
                            value={selectedVariants[product.id] || ''}
                            onChange={e => setSelectedVariants(p => ({ ...p, [product.id]: e.target.value }))}
                            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Selecionar opção...</option>
                            {product.variants.map(v => (
                              <option key={v.id} value={v.id} disabled={v.stock === 0}>
                                {v.name} — R$ {(v.price ?? 0).toFixed(2)}{v.stock === 0 ? ' (esgotado)' : v.stock <= 3 ? ` (${v.stock} rest.)` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {!product.variants?.length && product.stock > 0 && product.stock <= 5 && (
                        <p className="mt-1 text-xs font-medium text-amber-600">
                          Últimas {product.stock} unidades!
                        </p>
                      )}
                    </CardContent>

                    <CardFooter className="p-4 pt-0">
                      <Button
                        className="w-full"
                        disabled={(() => {
                            if (product.variants && product.variants.length > 0) {
                              const selVId = selectedVariants[product.id];
                              if (!selVId) return false; // will show "selecione"
                              const selV = product.variants.find(v => v.id === selVId);
                              return (selV?.stock ?? 0) === 0;
                            }
                            return product.stock === 0;
                          })()}
                        onClick={() => {
                          if (product.variants && product.variants.length > 0) {
                            const selVId = selectedVariants[product.id];
                            if (!selVId) { toast.error('Selecione uma opção antes de adicionar'); return; }
                            const selV = product.variants.find(v => v.id === selVId);
                            if (!selV) return;
                            const productWithVariant = { ...product, price: selV.price, stock: selV.stock };
                            addItem(productWithVariant, 1, selVId);
                            toast.success(`${product.name} (${selV.name}) adicionado!`);
                          } else {
                            addItem(product, 1);
                            toast.success(`${product.name} adicionado ao carrinho!`);
                          }
                        }}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        {(() => {
                            if (product.variants && product.variants.length > 0) {
                              const selVId = selectedVariants[product.id];
                              if (!selVId) return 'Adicionar';
                              const selV = product.variants.find(v => v.id === selVId);
                              return selV?.stock === 0 ? 'Esgotado' : 'Adicionar';
                            }
                            return product.stock === 0 ? 'Esgotado' : 'Adicionar';
                          })()}
                      </Button>
                    </CardFooter>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};