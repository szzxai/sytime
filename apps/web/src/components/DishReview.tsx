import './DishReview.css';
import { useUnsavedForm } from '../lib/useUnsavedForm';
import type { Dish, Review } from '@sytime/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import { api, endpoint, queryClient } from '../lib/api';
import { Upload } from './Media';
import { Dialog, Icon, Submit, useToast } from './ui';

const PAGE_SIZE = 50;
export function DishReview({
  dish,
  onClose,
  onPublished,
}: {
  dish?: Dish;
  onClose: () => void;
  onPublished?: (review: Review) => void;
}) {
  const toast = useToast();
  const draft = useUnsavedForm();
  const [selected, setSelected] = useState(dish || null);
  const [search, setSearch] = useState(dish?.name || '');
  const [count, setCount] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(!dish);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const catalog = useQuery({ ...endpoint<{ dishes: Dish[] }>('/api/dishes', false), staleTime: 0 });
  const q = search.normalize('NFC').trim().toLowerCase();
  const rows = (catalog.data?.dishes || []).filter(
    (d) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      d.pinyin.includes(q.replace(/\s/g, '')) ||
      d.pinyin_initials.includes(q.replace(/\s/g, '')),
  );
  const visible = rows.slice(0, count);
  function closeOptions() {
    setOpen(false);
    setCount(PAGE_SIZE);
    setActive(-1);
  }
  function choose(d: Dish) {
    setSelected(d);
    setSearch(d.name);
    setError('');
    input.current?.focus();
    closeOptions();
  }
  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) {
        setError('请从下拉列表选择已有菜品');
        throw new Error('请从下拉列表选择已有菜品');
      }
      const body = new FormData();
      body.set('dish_id', String(selected.id));
      body.set('name', selected.name);
      body.set('rating', String(rating));
      body.set('comment', comment);
      if (file) body.set('image', file);
      return api<{ status: string }>('/api/recipes', { method: 'POST', body });
    },
    onSuccess: () => {
      draft.clean();
      toast('评价已提交审核，通过后公开');
      queryClient.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).startsWith('/api/dishes') ||
          String(q.queryKey[0]).startsWith('/api/menu') ||
          q.queryKey[0] === '/api/recipes',
      });
      void onPublished;
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <Dialog
      id="reviewDialog"
      title="写评价"
      className="dialog--sheet dish-review"
      onClose={onClose}
    >
      <form
        id="recipeForm"
        onInput={draft.onInput}
        className="dialog__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!preparingImage) mutation.mutate();
        }}
      >
        <div className="dialog__body">
          <div
            className="field dish-picker"
            id="dishPicker"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) closeOptions();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && open) {
                e.preventDefault();
                e.stopPropagation();
                input.current?.focus();
                closeOptions();
              }
            }}
          >
            <label className="field__label" htmlFor="name">
              菜品
            </label>
            <div className="dish-picker__control">
              <input
                ref={input}
                className="input"
                id="name"
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls="dishOptions"
                aria-activedescendant={
                  open && active >= 0 ? `dish-choice-${visible[active]?.id}` : undefined
                }
                aria-invalid={!!error}
                placeholder="输入菜名、拼音或首字母后选择"
                autoComplete="off"
                maxLength={200}
                autoFocus
                value={search}
                onFocus={() => {
                  if (!selected) setOpen(true);
                }}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(null);
                  setCount(PAGE_SIZE);
                  setActive(-1);
                  setOpen(true);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setOpen(true);
                    const next =
                      e.key === 'ArrowDown'
                        ? (active + 1) % visible.length
                        : active < 0
                          ? visible.length - 1
                          : (active - 1 + visible.length) % visible.length;
                    setActive(next);
                    document
                      .getElementById(`dish-choice-${visible[next]?.id}`)
                      ?.scrollIntoView({ block: 'nearest' });
                  } else if (e.key === 'Enter' && open && active >= 0 && visible[active]) {
                    e.preventDefault();
                    choose(visible[active]);
                  }
                }}
              />
              <input type="hidden" id="selectedDishId" name="dish_id" value={selected?.id || ''} />
              <div
                className="dish-picker__popup"
                id="dishPickerPopup"
                hidden={!open && !catalog.error}
              >
                <div
                  className="dish-picker__options"
                  id="dishOptions"
                  role="listbox"
                  aria-label="已有菜品"
                  tabIndex={-1}
                >
                  {visible.map((d, i) => (
                    <button
                      key={d.id}
                      id={`dish-choice-${d.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      tabIndex={-1}
                      data-dish-choice={d.id}
                      className={`dish-picker__option${i === active ? ' is-active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(d)}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
                <p className="dish-picker__status" id="dishPickerStatus" role="status">
                  {catalog.isPending
                    ? '正在加载菜品…'
                    : catalog.error
                      ? '菜品加载失败，请重试'
                      : rows.length
                        ? `共 ${rows.length} 道，已显示 ${visible.length} 道`
                        : '没有匹配的菜品'}
                </p>
                <button
                  type="button"
                  className="btn btn--sm"
                  id="dishPickerMore"
                  aria-controls="dishOptions"
                  hidden={!!catalog.error || count >= rows.length}
                  onClick={() => {
                    setCount((n) => n + PAGE_SIZE);
                    if (count + PAGE_SIZE >= rows.length) input.current?.focus();
                  }}
                >
                  显示更多
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  id="dishPickerRetry"
                  hidden={!catalog.error}
                  onClick={() => {
                    setOpen(true);
                    catalog.refetch();
                  }}
                >
                  重新加载菜品
                </button>
              </div>
            </div>
            {error && <div className="field__error">{error}</div>}
          </div>
          <div className="field">
            <span className="field__label" id="ratingLabel">
              评分
            </span>
            <div className="rating-input" role="radiogroup" aria-labelledby="ratingLabel">
              {[5, 4, 3, 2, 1].map((n) => (
                <Fragment key={n}>
                  <input
                    type="radio"
                    name="rating"
                    id={`r${n}`}
                    value={n}
                    aria-label={`${n} 分`}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                  />
                  <label htmlFor={`r${n}`} title={`${n} 分`}>
                    <Icon name="star" />
                  </label>
                </Fragment>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="comment">
              评论 <span className="field__opt">（选填）</span>
            </label>
            <textarea
              className="textarea"
              id="comment"
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="field__foot">
              <span className="field__hint" />
              <span className="field__counter">{comment.length} / 500</span>
            </div>
          </div>
          <Upload file={file} onChange={setFile} onProcessingChange={setPreparingImage} />
        </div>
        <div className="dialog__foot">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <Submit id="recipeSubmit" pending={mutation.isPending} disabled={preparingImage}>
            提交审核
          </Submit>
        </div>
      </form>
    </Dialog>
  );
}
