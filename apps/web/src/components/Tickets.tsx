import { formatTime } from '../lib/api';
import { Picture } from './Media';
export interface Ticket {
  id: number;
  title: string;
  content: string;
  visibility: string;
  status: string;
  created_at: number;
  username: string;
  reply_by?: string;
  replied_at?: number;
  reply_content?: string;
  reply_image?: string;
}
export const ticketVisibility = {
  admin: '管理员及以上',
  operator: '仅运营者',
};
export function TicketCard({
  ticket: t,
  admin = false,
  onReply,
}: {
  ticket: Ticket;
  admin?: boolean;
  onReply?: () => void;
}) {
  const Heading = admin ? 'h2' : 'h3';
  return (
    <article className="card stack" data-ticket-id={t.id}>
      <div className="card__head">
        <Heading className="card__title">{t.title}</Heading>
        <span className={`badge badge--${t.status === 'resolved' ? 'ok' : 'pending'}`}>
          {t.status === 'resolved' ? '已批复' : '待处理'}
        </span>
      </div>
      <div className="u-muted u-fs-xs">
        {admin ? `提交人 ${t.username} · ` : ''}可见范围：
        {ticketVisibility[t.visibility as keyof typeof ticketVisibility]} ·{' '}
        {formatTime(t.created_at)}
      </div>
      <div className="prose">{t.content}</div>
      {t.status === 'resolved' ? (
        <div className="queue-item__reply stack">
          <b>
            批复 · {t.reply_by || '管理员'}
            {t.replied_at ? ` · ${formatTime(t.replied_at)}` : ''}
          </b>
          <div className="prose">{t.reply_content}</div>
          <Picture src={t.reply_image} caption="批复图片" />
        </div>
      ) : (
        admin && (
          <div>
            <button
              type="button"
              className="btn btn--sm"
              data-reply-ticket={t.id}
              onClick={onReply}
            >
              批复
            </button>
          </div>
        )
      )}
    </article>
  );
}
