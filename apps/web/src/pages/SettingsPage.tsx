import type { User } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { type Collection } from '../components/Collections';
import { TicketCard, type Ticket } from '../components/Tickets';
import { Empty, ErrorState, Loading, useToast } from '../components/ui';
import { SettingsLayout } from '../layouts/SettingsLayout';
import { api, endpoint, formValues, queryClient } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
import { useUnsavedForm } from '../lib/useUnsavedForm';
import { usePanel } from '../lib/usePanel';
export function SettingsPage() {
  return (
    <RequireLogin>
      <SettingsContent />
    </RequireLogin>
  );
}
function SettingsContent() {
  const ticketDraft = useUnsavedForm();
  const [privacy, setPrivacy] = useState<boolean | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState('');
  const { logout } = useSession();
  const toast = useToast();
  const [panel, setPanel] = usePanel(['security', 'site', 'tickets', 'messages'], 'security');
  const profile = useQuery(endpoint<{ user: User }>('/api/user/profile'));
  const meta = useQuery(endpoint<{ types: { all: string[] } }>('/api/shops/meta'));
  const collections = useQuery(
    endpoint<{ collections: Collection[] }>('/api/collections?section=shops'),
  );
  const tickets = useQuery({
    ...endpoint<{ tickets: Ticket[] }>('/api/tickets/mine'),
    enabled: panel === 'tickets',
  });
  const user = profile.data?.user;
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { method: 'PUT', body }),
    onSuccess: (data) => {
      if (data.reauthenticate) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.assign('/login.html');
        return;
      }
      toast('已保存');
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
      setPrivacy(null);
    },
    onError: (e) => {
      setPrivacyStatus(`${e.message}，已恢复原设置。`);
      toast(e.message, 'error');
    },
  });
  const site = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = formValues(form);
      const body = {
        default_page: values.defaultPage,
        recipe_default_view: values.recipeDefaultView,
        shop_default_sort: values.shopDefaultSort,
        shop_default_type: values.shopDefaultType,
        shop_layout_mode: values.shopLayoutMode,
        show_role: user?.role === 'user' || new FormData(form).has('showRole') ? 1 : 0,
      };
      await api('/api/user/settings', { method: 'PUT', body });
      if ('defaultCollectionShops' in values)
        await api('/api/user/settings/collection', {
          method: 'PUT',
          body: {
            default_collection_shops: values.defaultCollectionShops
              ? Number(values.defaultCollectionShops)
              : null,
          },
        });
      for (const key of [
        'defaultPage',
        'recipeDefaultView',
        'shopDefaultSort',
        'shopDefaultType',
        'shopLayoutMode',
      ])
        if (values[key]) localStorage.setItem(key, values[key]);
    },
    onSuccess: () => {
      toast('网站设置已保存到账号');
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const ticket = useMutation({
    mutationFn: (body: Record<string, string>) =>
      api('/api/tickets', {
        method: 'POST',
        body: {
          title: body.ticketTitle,
          content: body.ticketContent,
          visibility: body.ticketVisibility,
        },
      }),
    onSuccess: () => {
      toast('工单已提交，请等待处理');
      queryClient.invalidateQueries({ queryKey: ['/api/tickets/mine'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const bind: Record<string, Record<string, unknown>> = {};
  ['security', 'site', 'tickets', 'messages'].forEach((p) => {
    bind[`view-${p}`] = {
      hidden: panel !== p,
      className: `view${panel === p ? ' is-active' : ''}`,
    };
  });
  if (profile.isPending)
    return (
      <main id="main" className="main container">
        <Loading />
      </main>
    );
  if (profile.error || !user)
    return (
      <main id="main" className="main container">
        <ErrorState error={profile.error || new Error('设置加载失败')} retry={profile.refetch} />
      </main>
    );
  bind.settingsNav = {
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const link = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
      if (link) {
        e.preventDefault();
        setPanel(link.dataset.panel!);
      }
    },
  };
  bind.passwordForm = {
    noValidate: false,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const v = formValues(form);
      if (v.newPassword !== v.confirmPassword) {
        toast('两次输入的新密码不一致', 'error');
        return;
      }
      mutation.mutate(
        {
          path: '/api/user/password',
          body: { oldPassword: v.oldPassword, newPassword: v.newPassword },
        },
        { onSuccess: () => form.reset() },
      );
    },
  };
  bind.passwordSubmit = { disabled: mutation.isPending };
  bind.siteForm = {
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      site.mutate(e.currentTarget);
    },
  };
  bind.siteSubmit = { disabled: site.isPending };
  bind.defaultPage = { defaultValue: user.default_page };
  bind.recipeDefaultView = { defaultValue: user.recipe_default_view };
  bind.shopDefaultSort = { defaultValue: user.shop_default_sort };
  bind.shopDefaultType = { defaultValue: user.shop_default_type };
  bind.shopPrefFields = { hidden: false };
  bind.defaultCollectionShops = {
    defaultValue: user.default_collection_shops,
    disabled: collections.isPending,
  };
  bind.showRole = {
    defaultChecked: user.role === 'user' || user.show_role !== 0,
    disabled: user.role === 'user',
  };
  bind.collectionDefaultPublic = {
    checked: privacy ?? user.collection_default_public === 1,
    disabled: mutation.isPending,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setPrivacy(e.target.checked);
      setPrivacyStatus('');
      mutation.mutate({
        path: '/api/user/settings',
        body: { collection_default_public: e.target.checked ? 1 : 0 },
      });
    },
  };
  bind.ticketForm = {
    onInput: ticketDraft.onInput,
    noValidate: false,
    onSubmit: (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      ticket.mutate(formValues(form), {
        onSuccess: () => {
          ticketDraft.clean();
          form.reset();
        },
      });
    },
  };
  bind.ticketSubmit = { disabled: ticket.isPending };
  const slots: Record<string, React.ReactNode> = {
    settingsStatus: null,
    siteMsg: privacyStatus,
    shopDefaultType: (
      <>
        <option value="">全部</option>
        {meta.data?.types.all.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </>
    ),
    defaultCollectionShops: (
      <>
        <option value="">自动选择</option>
        {collections.data?.collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </>
    ),
    shopLayoutModeChoices: (
      <>
        {[
          { value: 'manual', label: '手动选择', desc: '页面内切换纵向 / 双栏，并记住上次选择。' },
          { value: 'auto', label: '自动', desc: '根据屏幕宽度自动切换布局。' },
        ].map((o) => (
          <label
            className="choice"
            key={o.value}
            title={o.value === 'manual' ? '手动切换样式' : '根据屏幕宽度自动切换'}
          >
            <input
              className="choice__input"
              type="radio"
              name="shopLayoutMode"
              value={o.value}
              defaultChecked={user.shop_layout_mode === o.value}
            />
            <span className="choice__body">
              <span className="choice__title">{o.label}</span>
              <span className="choice__desc">{o.desc}</span>
            </span>
          </label>
        ))}
      </>
    ),
    showRoleHint:
      user.role === 'user'
        ? '普通用户始终展示权限等级，无需设置。'
        : '关闭后，你的权限等级标签将不在评价等位置显示。',
    myTicketList: tickets.isPending ? (
      <Loading />
    ) : tickets.error ? (
      <ErrorState error={tickets.error} retry={tickets.refetch} />
    ) : tickets.data?.tickets.length ? (
      tickets.data.tickets.map((t) => <TicketCard ticket={t} key={t.id} />)
    ) : (
      <Empty icon="clipboard" title="暂无工单" description="遇到问题可以提交工单。" />
    ),
  };
  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-logout]')) {
          logout();
          location.href = '/index.html';
        }
      }}
    >
      <SettingsLayout key={String(user.id)} bind={bind} slots={slots} />
    </div>
  );
}
