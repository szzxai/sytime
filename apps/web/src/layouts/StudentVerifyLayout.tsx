import { FieldCounter } from '../components/FormFields';
import type { ReactNode, ComponentProps } from 'react';
export function StudentVerifyLayout({
  slots = {},
  bind = {},
}: {
  slots?: {
    submitBtn?: ReactNode;
  };
  bind?: {
    alreadyBox?: ComponentProps<'div'>;
    formBox?: ComponentProps<'div'>;
    applyForm?: ComponentProps<'form'>;
    submitBtn?: ComponentProps<'button'>;
  };
}) {
  return (
    <main id="main" className="auth container container--form">
      <div className="card auth-card auth-card--wide">
        <h1 className="auth-card__title">{'学生认证'}</h1>
        <div id="alreadyBox" className="empty empty--compact" hidden {...bind['alreadyBox']}>
          <div className="empty__icon">
            <svg className="icon" aria-hidden="true">
              <use href="/img/icons.svg#i-graduation"></use>
            </svg>
          </div>
          <div className="empty__title">{'你已认证为学生'}</div>
        </div>
        <div id="formBox" {...bind['formBox']}>
          <p className="auth-card__desc">
            {' 提交后由管理员审核；若管理员开启了邀请码，填入正确的邀请码可直接通过。 '}
          </p>
          <form id="applyForm" className="form" noValidate {...bind['applyForm']}>
            <div className="field">
              <label className="field__label" htmlFor="student_id">
                {'新生号'}
              </label>
              <input
                className="input"
                id="student_id"
                type="text"
                required
                enterKeyHint="next"
                name="student_id"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="class_name">
                {'班级'}
              </label>
              <input
                className="input"
                id="class_name"
                type="text"
                required
                enterKeyHint="next"
                name="class_name"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="real_name">
                {'真实姓名'}
              </label>
              <input
                className="input"
                id="real_name"
                type="text"
                required
                enterKeyHint="next"
                name="real_name"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="invite_code">
                {'邀请码 '}
                <span className="field__opt">{'（选填）'}</span>
              </label>
              <input
                className="input"
                id="invite_code"
                type="text"
                enterKeyHint="next"
                name="invite_code"
              />
              <div className="field__hint">{' 如果管理员开启了邀请码，填入可直接通过审核 '}</div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="extra_info">
                {'补充更多信息 '}
                <span className="field__opt">{'（选填）'}</span>
              </label>
              <textarea className="textarea" id="extra_info" data-counter="200" name="extra_info" />
              <div className="field__foot">
                <span className="field__hint">{'补充更多信息可提高通过率'}</span>
                <FieldCounter htmlFor="extra_info" max={200} />
              </div>
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--lg btn--block"
              id="submitBtn"
              {...bind['submitBtn']}
            >
              {'submitBtn' in slots ? slots['submitBtn'] : <>{' 提交认证 '}</>}
            </button>
            <div className="field__hint u-center">
              {' 重复提交将覆盖上一次申请；10 分钟内只能提交一次。 '}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
