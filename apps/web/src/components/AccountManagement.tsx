export function AccountManagement({ userId }: { userId: number }) {
  return (
    <section className="card stack">
      <h2>账号管理</h2>
      <p>在统一管理工作台中调整角色、处理封禁、解绑学生身份或管理头衔。</p>
      <a className="btn btn--primary" href={`/admin.html#users`} data-user-id={userId}>
        前往用户管理
      </a>
    </section>
  );
}
