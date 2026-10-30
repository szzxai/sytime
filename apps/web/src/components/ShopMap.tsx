import type { Shop } from '@sytime/shared';
import { useEffect, useRef, useState } from 'react';
import { useMapLinks } from './MapLinks';
import { ShopsMap } from '../maps/shops';
export interface ShopMeta {
  types: { all: string[]; preset?: string[] };
  can_create: boolean;
  can_interact: boolean;
  create_min_role: string;
  area: { name: string; text: string };
  map: {
    key_configured: boolean;
    static_map_configured: boolean;
    js_key: string;
    security_code: string;
    center: { lat: number; lng: number; zoom: number };
    area: { name: string; polygon: number[][] };
    anchors: { key: string; configured: boolean; lat: number; lng: number }[];
  };
}
export function ShopMap({
  meta,
  shops,
  id = 'shopMap',
  detail = false,
}: {
  meta?: ShopMeta;
  shops: Shop[];
  id?: string;
  detail?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const links = useMapLinks(host);
  const instance = useRef<{
    destroy?: () => void;
    setShops?: (shops: Shop[]) => void;
    setMarkers?: (shops: Shop[]) => void;
  } | null>(null);
  const initialShops = useRef(shops);
  initialShops.current = shops;
  const [notice, setNotice] = useState('地图加载中…');
  useEffect(() => {
    if (!meta) return;
    let active = true;
    const shops = initialShops.current;
    const config = {
      center:
        detail && shops[0] ? { lat: shops[0].lat, lng: shops[0].lng, zoom: 17 } : meta.map.center,
      area: detail ? null : meta.map.area,
      shops,
    };
    async function load() {
      try {
        let result;
        if (meta!.map.static_map_configured) result = ShopsMap.renderStatic(host.current, config);
        else if (meta!.map.key_configured) {
          await ShopsMap.load(meta!.map.js_key, meta!.map.security_code);
          if (!active) return;
          result = ShopsMap.render(host.current, config);
        } else {
          setNotice('高德地图暂未配置，可在下方列表浏览店铺。');
          return;
        }
        if (!active) {
          result.map?.destroy?.();
          return;
        }
        if (result.ok) {
          instance.current = result.map;
          setNotice('');
        } else setNotice(result.message || '地图初始化失败，可在下方列表浏览店铺。');
      } catch {
        if (active) setNotice('地图加载失败，可在下方列表浏览店铺。');
      }
    }
    load();
    return () => {
      active = false;
      instance.current?.destroy?.();
      instance.current = null;
    };
  }, [meta, detail]);
  useEffect(() => {
    instance.current?.setShops?.(shops);
    if (instance.current && meta)
      ShopsMap.update(instance.current, shops, { center: meta.map.center, area: meta.map.area });
  }, [shops, meta]);
  return (
    <div
      className={`shop-map${detail ? ' shop-map--detail' : ''}`}
      id={id}
      role="region"
      aria-label={detail ? '店铺位置地图' : '店铺地图'}
    >
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      {links}
      {notice && <div className="shop-map__state u-muted">{notice}</div>}
    </div>
  );
}
export function shopHue(type: string) {
  return ShopsMap.hue(type);
}
