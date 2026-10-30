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
            {'我们是一群苏州中学的学生，想让校园信息更容易找到。'}
            <br className="desktop-break"></br>
            {'从每天的食堂菜谱，到校园里的一处风景，'}
            <br className="desktop-break"></br>
            {'我们一起建设、完善和维护 拾光酥糕。'}
          </p>
          <SiteLink className="btn btn--sm" href="about.html">
            {'了解更多'}
          </SiteLink>
        </section>
        <section className="landing-row" aria-labelledby="teamTitle">
          <div className="landing-row__intro">
            <h2 id="teamTitle">{'开发团队'}</h2>
            <p>{'由热爱技术的同学共同开发与维护，把想法写成代码，让校园生活更方便一点。'}</p>
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
              {'一个由同学共同维护的校园信息平台。你的每一次分享，都让大家的校园生活方便一点。'}
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
          <h2 id="noteTitle">{'在苏中，记录属于我们的拾光'}</h2>
          <p>
            {'从人民路到道山，从教室到食堂。'}
            <br></br>
            {'愿每一份分享，都成为后来同学的路标。'}
          </p>
        </section>
      </div>
    </main>
  );
}
