import { useState } from 'react';
import './AboutPage.css';

type Member = { name: string; role: string; link?: string };
const profiles = {
  zhou: 'https://github.com/Zhou-Shilin',
  li: 'https://github.com/lirenfei2021',
  xu: 'https://github.com/Blinstarr',
  yang: 'https://github.com/williamyang45',
};
const teams: { year: string; members: Member[] }[] = [
  {
    year: '2026–2027',
    members: [
      { name: '周示麟', role: 'Co-Founder', link: profiles.zhou },
      { name: '李任飞', role: 'Co-Founder', link: profiles.li },
      { name: '许王熠宸', role: 'Founding Engineer', link: profiles.xu },
      { name: '杨晨逍', role: 'Founding Engineer', link: profiles.yang },
      { name: '孙海博', role: 'Geospatial Engineer' },
      { name: '郑智允', role: 'Full Stack Engineer' },
      { name: '李今希', role: 'Full Stack Engineer' },
    ],
  },
  {
    year: '初创',
    members: [
      { name: '王勇亮', role: 'Founder', link: 'https://github.com/wyl-b' },
      { name: '李任飞', role: 'Founding Engineer', link: profiles.li },
      { name: '周示麟', role: 'Founding Engineer', link: profiles.zhou },
      { name: '许王熠宸', role: 'Founding Engineer', link: profiles.xu },
      { name: '杨晨逍', role: 'Founding Engineer', link: profiles.yang },
    ],
  },
];
const values = [
  {
    title: '成长',
    description: '在真实的项目中探索人工智能，迎接设计与工程的挑战，让想法落地，让能力成长。',
    icon: 'growth',
  },
  {
    title: '好奇',
    description: '保持对未知的好奇，主动研究、独立思考。从一个好问题出发，找到自己的答案。',
    icon: 'curiosity',
  },
  {
    title: '热忱',
    description: '用热爱驱动创造，用持续的投入打磨产品。与志同道合的伙伴一起，让校园生活更好。',
    icon: 'passion',
  },
];
function ValueIcon({ kind }: { kind: string }) {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kind === 'curiosity' ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'growth' ? (
        <>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </>
      ) : kind === 'curiosity' ? (
        <>
          <path d="M9 18h6M10 21h4M9.00082 15C9.00098 13 8.50098 12.5 7.50082 11.5C6.50067 10.5 6.02422 9.48689 6.00082 8C5.95284 4.95029 8.00067 3 12.0008 3C16.001 3 18.0488 4.95029 18.0008 8C17.9774 9.48689 17.5007 10.5 16.5008 11.5C15.501 12.5 15.001 13 15.0008 15" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
        </>
      )}
    </svg>
  );
}
function ProfileLink({ member }: { member: Member }) {
  return member.link ? (
    <a
      className="about-member__link"
      href={member.link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${member.name} 的 GitHub（新窗口打开）`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 11.9976C14 9.5059 11.683 7 8.85714 7H7.14286C4.30254 7 2 9.23752 2 11.9976C2 14.376 3.70973 16.3664 6 16.8714C6.36756 16.9525 6.75006 16.9952 7.14286 16.9952M10 11.9976C10 14.4893 12.317 16.9952 15.1429 16.9952H16.8571C19.6975 16.9952 22 14.7577 22 11.9976C22 9.6192 20.2903 7.62884 18 7.12383C17.6324 7.04278 17.2499 6.99999 16.8571 6.99999" />
      </svg>
    </a>
  ) : null;
}
export function AboutPage() {
  const [selectedYear, setSelectedYear] = useState(teams[0]!.year);
  const team = teams.find(({ year }) => year === selectedYear)!;
  return (
    <main id="main" className="about-page">
      <header className="about-intro">
        <h1>关于我们</h1>
        <p>
          我们是苏州中学人工智能实验室，隶属于软件开发社，由一群热爱探索的学生组成。
          我们研究人工智能的理论与应用，也共同开发和维护「拾光酥糕」，用人机协同的实践，让校园信息触手可及。
        </p>
      </header>
      <section className="about-values" aria-labelledby="about-values-title">
        <h2 id="about-values-title">我们的价值观</h2>
        <div className="about-values__grid">
          {values.map((value) => (
            <article className="about-value" key={value.title}>
              <div className="about-value__icon">
                <ValueIcon kind={value.icon} />
              </div>
              <h3>{value.title}</h3>
              <p>{value.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="about-team" aria-labelledby="about-team-title">
        <h2 id="about-team-title">Our Team</h2>
        <div className="about-team__years" role="group" aria-label="团队时期">
          {teams.map(({ year }) => (
            <button
              type="button"
              key={year}
              aria-pressed={year === selectedYear}
              aria-controls="about-members"
              onClick={() => setSelectedYear(year)}
            >
              {year}
            </button>
          ))}
        </div>
        <div
          className="about-team__grid"
          id="about-members"
          aria-live="polite"
          aria-label={`${team.year} 团队`}
        >
          {team.members.map((member) => (
            <article className="about-member" key={member.name}>
              <div className="about-member__body">
                <div className="about-member__name-row">
                  <h3>{member.name}</h3>
                  <ProfileLink member={member} />
                </div>
                <p>{member.role}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
