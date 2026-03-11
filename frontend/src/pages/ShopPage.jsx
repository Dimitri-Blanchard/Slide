import React, { useState, useEffect, useMemo } from 'react';
import { Search, ShoppingBag, Sparkles, Palette, Award, Check } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useOrbs } from '../context/OrbsContext';
import { useAuth } from '../context/AuthContext';
import { shop as shopApi } from '../api';
import { invalidateCache } from '../api';
import './ShopPage.css';

const CATEGORIES = ['all', 'avatarDecorations', 'profileEffects', 'nameplates'];
const CATEGORY_ICONS = {
  all: ShoppingBag,
  avatarDecorations: Sparkles,
  profileEffects: Palette,
  nameplates: Award,
};

const EQUIPPED_COLUMN = {
  avatarDecorations: 'equipped_avatar_decoration_id',
  profileEffects: 'equipped_profile_effect_id',
  nameplates: 'equipped_nameplate_id',
};

export default function ShopPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [equipping, setEquipping] = useState(null);
  const { t } = useLanguage();
  const { notify } = useNotification();
  const orbs = useOrbs();
  const { user } = useAuth();

  useEffect(() => {
    shopApi
      .getItems()
      .then(({ items: data }) => setItems(data || []))
      .catch(() => {
        setItems([]);
        notify.error('Failed to load shop');
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeCategory !== 'all') {
      list = list.filter((item) => item.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, activeCategory, searchQuery]);

  const handlePurchase = async (item) => {
    if (item.owned || purchasing) return;
    if (orbs < item.priceOrbs) {
      notify.error(t('shop.notEnoughOrbs') || 'Not enough Orbs');
      return;
    }
    setPurchasing(item.id);
    try {
      await shopApi.purchase(item.id);
      invalidateCache('/shop');
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, owned: true } : i))
      );
      notify.success(`${item.name} purchased!`);
    } catch (err) {
      notify.error(err?.message || 'Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  const isEquipped = (item) => {
    const col = EQUIPPED_COLUMN[item.category];
    return col && user?.[col] === item.id;
  };

  const handleEquip = async (item) => {
    if (!item.owned || equipping) return;
    setEquipping(item.id);
    try {
      await shopApi.equip(item.id);
      notify.success(t('shop.equipped') || 'Equipped!');
    } catch (err) {
      notify.error(err?.message || 'Failed to equip');
    } finally {
      setEquipping(null);
    }
  };

  const handleUnequip = async (item) => {
    if (!item.owned || equipping) return;
    setEquipping(item.id);
    try {
      await shopApi.unequip(item.category);
      notify.success(t('shop.unequipped') || 'Unequipped');
    } catch (err) {
      notify.error(err?.message || 'Failed to unequip');
    } finally {
      setEquipping(null);
    }
  };

  const getItemIcon = (category) => {
    const Icon = CATEGORY_ICONS[category] || ShoppingBag;
    return Icon;
  };

  return (
    <div className="shop-page">
      <header className="shop-hero">
        <div className="shop-hero-top">
          <h1 className="shop-title">{t('shop.title')}</h1>
          <span className="shop-orbs-badge">{orbs} {t('shop.orbs')}</span>
        </div>
        <div className="shop-search">
          <Search size={18} className="shop-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('shop.searchPlaceholder')}
            className="shop-search-input"
          />
        </div>
      </header>

      <div className="shop-categories">
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          return (
            <button
              key={cat}
              className={`shop-category-chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <Icon size={16} className="shop-category-icon" strokeWidth={2} />
              {t(`shop.${cat}`)}
            </button>
          );
        })}
      </div>

      <div className="shop-content">
        {loading ? (
          <div className="shop-grid shop-grid-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="shop-item-card shop-item-skeleton">
                <div className="shop-item-skeleton-image" />
                <div className="shop-item-skeleton-name" />
                <div className="shop-item-skeleton-desc" />
                <div className="shop-item-skeleton-price" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="shop-empty">
            <ShoppingBag size={56} strokeWidth={1.25} />
            <p>{t('shop.noResults')}</p>
          </div>
        ) : (
          <div className="shop-grid">
            {filteredItems.map((item) => {
              const ItemIcon = getItemIcon(item.category);
              return (
                <div
                  key={item.id}
                  className={`shop-item-card ${item.owned ? 'owned' : ''}`}
                >
                  <div className="shop-item-image">
                    <ItemIcon size={36} strokeWidth={1.5} />
                  </div>
                  <h3 className="shop-item-name">{item.name}</h3>
                  {item.descriptionKey && (
                    <p className="shop-item-desc">{t(item.descriptionKey)}</p>
                  )}
                  <p className="shop-item-price">
                    {item.priceOrbs} {t('shop.orbs')}
                  </p>
                  {item.owned ? (
                    isEquipped(item) ? (
                      <button
                        className="shop-item-purchase shop-item-equip equipped"
                        disabled={equipping === item.id}
                        onClick={() => handleUnequip(item)}
                      >
                        <Check size={14} strokeWidth={2.5} />
                        {t('shop.equipped') || 'Equipped'}
                      </button>
                    ) : (
                      <button
                        className="shop-item-purchase shop-item-equip"
                        disabled={equipping === item.id}
                        onClick={() => handleEquip(item)}
                      >
                        {equipping === item.id ? '...' : (t('shop.equip') || 'Equip')}
                      </button>
                    )
                  ) : (
                    <button
                      className="shop-item-purchase"
                      disabled={purchasing === item.id}
                      onClick={() => handlePurchase(item)}
                    >
                      {purchasing === item.id ? '...' : t('shop.purchase')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
