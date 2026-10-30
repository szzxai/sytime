import { atLeast, roleWeights, type Title, type User } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState, type FocusEvent } from 'react';
import { AccountManagement } from '../components/AccountManagement';
import { CollectionsBrowser } from '../components/Collections';
import {
  Avatar,
  Dialog,
  Empty,
  ErrorState,
  Icon,
  Loading,
  RoleTag,
  TitleBadge,
  useToast,
} from '../components/ui';
import { ProfileLayout } from '../layouts/ProfileLayout';
import { UserLayout } from '../layouts/UserLayout';
import { api, endpoint, queryClient } from '../lib/api';
import { RequireLogin, useSession } from '../lib/session';
import { usePanel } from '../lib/usePanel';
type OwnedTitle = Omit<Title, 'progress'> & {
  hue: string;
  equipped: number;
  source: string;
  granted_at?: number;
  progress?: number;
  target?: number;
  text?: string;
  met?: boolean;
};
export function ProfilePage() {
  return (
    <RequireLogin>
      <ProfileContent />
    </RequireLogin>
  );
}
export function UserPage() {
  const { user } = useSession();
  const id = Number(new URLSearchParams(location.search).get('id'));
  if (user?.id === id) {
    location.replace('/profile.html');
    return null;
  }
  if (!Number.isSafeInteger(id) || id <= 0)
    return (
      <main id="main" className="main container">
        <Empty title="用户不存在" />
      </main>
    );
  return <ProfileContent userId={id} />;
}
function ProfileContent({ userId }: { userId?: number }) {
  const { user: actor } = useSession();
  const toast = useToast();
  const profile = useQuery(
    endpoint<{ user: User }>(
      userId ? `/api/users/${userId}/profile` : '/api/user/profile',
      !userId,
    ),
  );
  const publicCollections = useQuery({
    ...endpoint<{ collections: { id: number }[] }>(`/api/users/${userId}/collections`, false),
    enabled: !!userId,
  });
  const user = profile.data?.user;
  const [panel, setPanel] = usePanel(['home', 'favorites', 'titles', 'manage'], 'home');
  const [edit, setEdit] = useState<{ field: 'nickname' | 'signature'; value: string } | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const titles = useQuery({
    ...endpoint<{ titles: OwnedTitle[]; locked: OwnedTitle[] }>(
      userId ? `/api/users/${userId}/titles` : '/api/user/titles',
      !userId,
    ),
    enabled: !!user,
  });
  const titleRows = titles.data?.titles || [];
  const equipped = titleRows.find((t) => t.equipped);
  const selected = selection === null ? (equipped ? String(equipped.id) : '') : selection;
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api(path, { method: path.endsWith('/avatar') ? 'POST' : 'PUT', body }),
    onSuccess: () => {
      toast('已保存');
      queryClient.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).includes('/profile') || q.queryKey[0] === '/api/user/titles',
      });
      setEdit(null);
    },
    onError: (e) => toast(e.message, 'error'),
  });
  function blur(field: 'nickname' | 'signature', e: FocusEvent<HTMLSpanElement>) {
    const text = e.currentTarget.textContent?.replace(/\s+/g, ' ').trim() || '';
    if (text !== String(user?.[field] || '')) setEdit({ field, value: text });
  }
  if (profile.isPending)
    return (
      <main id="main" className="main container">
        <Loading />
      </main>
    );
  if (profile.error || !user)
    return (
      <main id="main" className="main container">
        <ErrorState error={profile.error || new Error('用户不存在')} retry={profile.refetch} />
      </main>
    );
  const canManage =
    !!userId &&
    !!actor &&
    actor.id !== user.id &&
    roleWeights[actor.role] > roleWeights[user.role] &&
    (atLeast(actor.role, 'super_admin') || actor.permissions?.includes('user_manage'));
  const bind: Record<string, Record<string, unknown>> = {
    profileStatus: {},
    userHero: { hidden: false },
    userNav: { hidden: false },
    heroNickname: userId
      ? {}
      : {
          contentEditable: 'plaintext-only',
          suppressContentEditableWarning: true,
          onBlur: (e: FocusEvent<HTMLSpanElement>) => blur('nickname', e),
          onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              e.currentTarget.textContent = user.nickname;
              e.currentTarget.blur();
            }
          },
        },
    heroSignature: userId
      ? {}
      : {
          contentEditable: 'plaintext-only',
          suppressContentEditableWarning: true,
          onBlur: (e: FocusEvent<HTMLSpanElement>) => blur('signature', e),
          onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              e.currentTarget.textContent = String(user.signature || '');
              e.currentTarget.blur();
            }
          },
        },
    chooseAvatar: { onClick: () => file.current?.click() },
    avatarFile: {
      ref: file,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!['image/jpeg', 'image/png'].includes(f.type) || f.size > 2097152) {
          toast('请选择 2 MB 以内的 JPG / PNG 图片', 'error');
          return;
        }
        const body = new FormData();
        body.set('avatar', f);
        mutation.mutate({ path: '/api/user/avatar', body });
      },
    },
    wearSubmit: {
      disabled: mutation.isPending || selected === (equipped ? String(equipped.id) : ''),
      onClick: () =>
        mutation.mutate({
          path: '/api/user/title',
          body: { title_id: selected ? Number(selected) : null },
        }),
    },
    favoritesNav: { hidden: !!userId && !publicCollections.data?.collections.length },
    manageNav: { hidden: !canManage },
  };
  ['home', 'favorites', 'titles', 'manage'].forEach(
    (p) =>
      (bind[`view-${p}`] = {
        hidden: panel !== p,
        className: `view${panel === p ? ' is-active' : ''}`,
      }),
  );
  const titlesContent = titles.isPending ? (
    <Loading />
  ) : (
    <>
      {!userId && (
        <label className="choice">
          <input
            className="choice__input"
            type="radio"
            name="wear"
            value=""
            checked={selected === ''}
            onChange={() => setSelection('')}
          />
          <span className="choice__body">
            <span className="choice__title">不佩戴头衔</span>
          </span>
        </label>
      )}
      {titleRows.map((t) => (
        <label className="choice" data-hue={t.hue} key={t.id}>
          <input
            className="choice__input"
            type="radio"
            name="wear"
            value={t.id}
            checked={selected === String(t.id)}
            disabled={!!userId}
            onChange={() => setSelection(String(t.id))}
          />
          <span className="choice__body">
            <span className="choice__badge-row">
              <TitleBadge title={t} />
              <Icon name="check-circle" className="choice__check" />
            </span>
            <span className="choice__desc">
              {t.description || (t.source === 'auto' ? '自动获得' : '管理员授予')}
            </span>
          </span>
        </label>
      ))}
    </>
  );
  const slots: Record<string, React.ReactNode> = {
    profileStatus: null,
    userStatus: null,
    heroUsername: user.username,
    heroNickname: user.nickname || '',
    heroSignature: String(user.signature || ''),
    heroRole: (
      <>
        <RoleTag role={user.role} showRole={user.show_role} />
        <TitleBadge title={user.title as Title} />
      </>
    ),
    avatarBox: <Avatar user={user} size="xl" />,
    heroAvatar: <Avatar user={user} size="xl" />,
    'view-home': (
      <Empty
        icon="compass"
        title={userId ? `${user.nickname || user.username} 的主页` : '个人主页'}
        description={
          userId ? '这里会展示该用户的动态与发布内容。' : '这里会展示你的动态与发布内容。'
        }
      />
    ),
    'view-favorites': panel === 'favorites' ? <CollectionsBrowser userId={userId} /> : null,
    titleChoices: titlesContent,
    titlePreview: <TitleBadge title={titleRows.find((t) => String(t.id) === selected)} />,
    titlesLocked: (
      <>
        {titles.data?.locked
          ?.filter((t) => !t.met && Number(t.progress) > 0)
          .sort((a, b) => (b.progress || 0) / (b.target || 1) - (a.progress || 0) / (a.target || 1))
          .map((t) => (
            <label className="choice choice--locked" data-hue={t.hue} key={t.id}>
              <input className="choice__input" type="radio" disabled />
              <span className="choice__body">
                <TitleBadge title={t} />
                <span className="choice__desc">{t.description}</span>
                <span className="choice__meta">{t.text}</span>
              </span>
            </label>
          ))}
      </>
    ),
    'view-manage': canManage && panel === 'manage' ? <AccountManagement userId={user.id} /> : null,
  };
  if (userId) slots['view-titles'] = titlesContent;
  return (
    <div
      onClick={(e) => {
        const nav = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
        if (nav) {
          e.preventDefault();
          setPanel(nav.dataset.panel!);
        }
      }}
    >
      {userId ? (
        <UserLayout bind={bind} slots={slots} />
      ) : (
        <ProfileLayout bind={bind} slots={slots} />
      )}
      {edit && (
        <Dialog
          title={edit.field === 'nickname' ? '保存昵称' : '保存个性签名'}
          onClose={() => {
            const el = document.getElementById(
              edit.field === 'nickname' ? 'heroNickname' : 'heroSignature',
            );
            if (el) el.textContent = String(user[edit.field] || '');
            setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (edit.field === 'nickname' && !edit.value) {
                toast('昵称不能为空', 'error');
                return;
              }
              mutation.mutate({
                path: `/api/user/${edit.field}`,
                body: { [edit.field]: edit.value.slice(0, edit.field === 'nickname' ? 20 : 80) },
              });
            }}
          >
            <div className="dialog__body">
              是否保存{edit.field === 'nickname' ? '昵称' : '个性签名'}的修改？
            </div>
            <div className="dialog__foot">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const el = document.getElementById(
                    edit.field === 'nickname' ? 'heroNickname' : 'heroSignature',
                  );
                  if (el) el.textContent = String(user[edit.field] || '');
                  setEdit(null);
                }}
              >
                不保存
              </button>
              <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>
                保存
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
