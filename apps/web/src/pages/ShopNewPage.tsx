import { SiteLink } from '../components/SiteLink';
import { useUnsavedForm } from '../lib/useUnsavedForm';
import type { Shop } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ShopMap, type ShopMeta } from '../components/ShopMap';
import { Empty, ErrorState, Loading, useToast } from '../components/ui';
import { ShopNewLayout } from '../layouts/ShopNewLayout';
import { api, ApiError, endpoint, formValues, loginUrl } from '../lib/api';
import { useSession } from '../lib/session';
import { ShopsMap } from '../maps/shops';
export function ShopNewPage() {
  const { token } = useSession();
  const toast = useToast();
  const draft = useUnsavedForm();
  const meta = useQuery(endpoint<ShopMeta>('/api/shops/meta'));
  const [type, setType] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState('');
  const [point, setPoint] = useState({ lat: '', lng: '' });
  const [duplicate, setDuplicate] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: (form: HTMLFormElement) => {
      const v = formValues(form);
      return api<{ shop: Shop }>('/api/shops', {
        method: 'POST',
        body: {
          name: v.sName,
          address: v.sAddr,
          location_note: v.sNote,
          dianping_url: v.sDianping,
          type: type === '__other' ? custom : type,
          lat: Number(v.sLat),
          lng: Number(v.sLng),
          campus_distance_m: Number(v.sCampusDist),
          campus_walk_min: Number(v.sCampusWalk),
          metro_station: v.sMetro,
          metro_exit: v.sMetroExit,
          metro_distance_m: Number(v.sMetroDist),
          metro_walk_min: Number(v.sMetroWalk),
        },
      });
    },
    onSuccess: (r) => {
      draft.clean();
      toast('已添加');
      location.href = `/shop.html?id=${r.shop.id}`;
    },
    onError: (e) => {
      toast(e.message, 'error');
      if (e instanceof ApiError && e.data.existing_id) setDuplicate(Number(e.data.existing_id));
    },
  });
  if (meta.isPending)
    return (
      <main id="main" className="main container">
        <Loading />
      </main>
    );
  if (meta.error)
    return (
      <main id="main" className="main container">
        <ErrorState error={meta.error} retry={meta.refetch} />
      </main>
    );
  const can = token && meta.data.can_create;
  const preview =
    point.lat && point.lng
      ? [
          {
            id: 0,
            name: '新店铺',
            type: type || '其他',
            lat: Number(point.lat),
            lng: Number(point.lng),
          } as Shop,
        ]
      : [];
  const bind: Record<string, Record<string, unknown>> = {
    shopForm: {
      onInput: draft.onInput,
      hidden: !can,
      onSubmit: (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const values = formValues(e.currentTarget);
        const next: Record<string, string> = {};
        if (!values.sName.trim()) next.sName = '请填写店铺名称';
        if (!/[路街巷弄坊道]/.test(values.sAddr) || !/[0-9０-９]+\s*号/.test(values.sAddr))
          next.sAddr = '请填写道路/巷坊名与门牌号（如十梓街 123 号）';
        if (!type || (type === '__other' && !custom.trim())) next.typeField = '请选择店铺类型';
        for (const id of [
          'sLat',
          'sLng',
          'sCampusDist',
          'sCampusWalk',
          'sMetro',
          'sMetroExit',
          'sMetroDist',
          'sMetroWalk',
        ])
          if (!values[id]?.trim()) next[id] = '请填写此项';
        setErrors(next);
        if (Object.keys(next).length) return;
        mutation.mutate(e.currentTarget);
      },
    },
    permNotice: { hidden: !!can },
    shopSubmit: { disabled: mutation.isPending },
    customType: {
      hidden: type !== '__other',
      value: custom,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCustom(e.target.value),
    },
    sLat: {
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setPoint((p) => ({ ...p, lat: e.target.value })),
    },
    sLng: {
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setPoint((p) => ({ ...p, lng: e.target.value })),
    },
    measureCampus: {
      onClick: async () => {
        try {
          const anchor = meta.data.map.anchors.find((a) => a.key === 'campus');
          if (!anchor || !point.lat || !point.lng)
            throw new Error('请先填写店铺坐标，再测算步行路线');
          await ShopsMap.load(meta.data.map.js_key, meta.data.map.security_code);
          const route = await ShopsMap.walk(null, anchor, {
            lat: Number(point.lat),
            lng: Number(point.lng),
          });
          (document.getElementById('sCampusDist') as HTMLInputElement).value = String(route.meters);
          (document.getElementById('sCampusWalk') as HTMLInputElement).value = String(
            route.minutes,
          );
          toast('已按高德步行路线填入，请核对');
        } catch (e) {
          toast((e as Error).message, 'error');
        }
      },
    },
  };
  for (const [id, error] of Object.entries(errors))
    bind[id] = { ...bind[id], 'aria-invalid': !!error };
  return (
    <ShopNewLayout
      bind={bind}
      slots={{
        ...Object.fromEntries(
          Object.entries(errors).map(([id, error]) => [
            `${id}Error`,
            <div className="field__error" key={id}>
              {error}
            </div>,
          ]),
        ),
        permNotice: can ? (
          duplicate ? (
            <SiteLink href={`/shop.html?id=${duplicate}`}>查看已有店铺</SiteLink>
          ) : null
        ) : (
          <Empty
            title={token ? '需要学生认证' : '登录后才能添加店铺'}
            description="添加店铺需要学生及以上权限。"
          >
            <SiteLink
              className="btn btn--primary"
              href={token ? '/student_verify.html' : loginUrl()}
            >
              {token ? '去认证' : '去登录'}
            </SiteLink>
          </Empty>
        ),
        scopeText: `收录范围：${meta.data.area.text}。距离与步行时间请在高德地图用步行路线查询后填写。`,
        typeChips: (
          <>
            {[...(meta.data.types.preset || meta.data.types.all), '__other'].map((t) => (
              <label className="chip" key={t}>
                <input
                  className="chip__input"
                  type="radio"
                  name="shopType"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                <span className="chip__face">{t === '__other' ? '自定义' : t}</span>
              </label>
            ))}
          </>
        ),
        pickMap: (
          <ShopMap
            key={`${point.lat}:${point.lng}`}
            meta={meta.data}
            shops={preview}
            id="previewMap"
            detail
          />
        ),
      }}
    />
  );
}
