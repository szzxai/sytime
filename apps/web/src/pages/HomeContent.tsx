import { SiteLink } from '../components/SiteLink';
export function HomeContent() {
  return (
    <main id="main" className="landing">
      <section className="landing-hero" aria-labelledby="homeTitle">
        <img
          className="landing-hero__statue"
          src="/img/fan-zhongyan-user.png"
          alt="范仲淹像的绿色与白色剪影"
          width="160"
          height="390"
          fetchPriority="high"
        ></img>
        <h1 id="homeTitle">
          {'苏州中学最大的'}
          <br></br>
          {'校园信息平台'}
        </h1>
      </section>
      <div className="landing-content">
        <section className="landing-about" id="about" aria-labelledby="aboutTitle">
          <h2 id="aboutTitle">{'关于我们'}</h2>
          <p>
            {'「拾光酥糕」是由苏中学子自主构建的校园数字指南。'}
            <br className="desktop-break"></br>
            {'从每日三餐的食谱测评，到校园角落的地理坐标，'}
            <br className="desktop-break"></br>
            {'我们致力于整合分散的校园资讯，让每一份信息都触手可及。'}
          </p>
          <SiteLink className="btn btn--sm" href="about.html">
            {'了解更多'}
          </SiteLink>
        </section>
        <section className="landing-row" aria-labelledby="teamTitle">
          <div className="landing-row__intro">
            <h2 id="teamTitle">{'开发团队'}</h2>
            <p>{'源于热爱，始于代码。由志愿者构建和维护，用技术探索校园生活的更多可能。'}</p>
          </div>
          <ul className="landing-teams" aria-label="开发团队">
            <li className="landing-team">
              <img src="/img/team-vc.svg" alt="橙子切面标志" width="48" height="48"></img>
              <span>{'软开人工智能部'}</span>
            </li>
            <li className="landing-team">
              <img
                src="/img/team-software.svg"
                alt="苏州中学软件开发社简化标志"
                width="48"
                height="48"
              ></img>
              <span>{'苏州中学软件开发社'}</span>
            </li>
          </ul>
        </section>
        <section className="landing-row" aria-labelledby="involvedTitle">
          <div className="landing-row__intro">
            <h2 id="involvedTitle">{'一起完善'}</h2>
            <p>
              {
                '这是一个工具，更是一座由全体同学共建的校园信息库。你的每一次标注与评价，都在让这个平台变得更加完整。'
              }
            </p>
          </div>
          <div className="landing-accordion">
            <details>
              <summary>
                {'分享校园生活'}
                <svg className="icon" aria-hidden="true">
                  <use href="/img/icons.svg#i-chevron-down"></use>
                </svg>
              </summary>
              <div>
                <div className="landing-accordion__inner">
                  {'分享喜欢的小店，为下一位同学留下真实的美食体验。'}
                  <SiteLink href="shops.html">{'去三元坊必吃榜'}</SiteLink>
                </div>
              </div>
            </details>
            <details>
              <summary>
                {'留下你的推荐'}
                <svg className="icon" aria-hidden="true">
                  <use href="/img/icons.svg#i-chevron-down"></use>
                </svg>
              </summary>
              <div>
                <div className="landing-accordion__inner">
                  {'为吃过的菜写下真实评价，也把三元坊值得一去的小店推荐给大家。'}
                  <SiteLink href="shops.html">{'发现周边美食'}</SiteLink>
                  {'，或'}
                  <SiteLink href="recipe.html">{'评价食堂菜品'}</SiteLink>
                  {'。'}
                </div>
              </div>
            </details>
            <details>
              <summary>
                {'反馈问题与建议'}
                <svg className="icon" aria-hidden="true">
                  <use href="/img/icons.svg#i-chevron-down"></use>
                </svg>
              </summary>
              <div>
                <div className="landing-accordion__inner">
                  {'发现信息有误，或有新的想法？登录后提交工单，我们会在站内回复。'}
                  <SiteLink href="settings.html#tickets">{'提交反馈'}</SiteLink>
                </div>
              </div>
            </details>
          </div>
        </section>
        <section className="landing-note" aria-labelledby="noteTitle">
          <h2 id="noteTitle">{'探索苏中日常，定格校园拾光'}</h2>
          <p>
            {'连接三餐四季与道山风物，'}
            <br></br>
            {'汇聚属于苏中人的共同记忆。'}
          </p>
        </section>
      </div>
    </main>
  );
}
