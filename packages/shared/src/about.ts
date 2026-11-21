export type AboutMember = { name: string; role: string; github?: string; avatar: string };

const zhou = { name: '周示麟', github: 'Zhou-Shilin', avatar: '' };
const li = { name: '李任飞', github: 'lirenfei2021', avatar: '' };
const xu = { name: '许王熠宸', github: 'Blinstarr', avatar: '' };
const yang = { name: '杨晨逍', github: 'williamyang45', avatar: '' };

export const aboutTeams: { year: string; members: AboutMember[] }[] = [
  {
    year: '2026–2027',
    members: [
      { ...zhou, role: 'Co-Founder' },
      { ...li, role: 'Co-Founder' },
      { ...xu, role: 'Founding Engineer' },
      { ...yang, role: 'Founding Engineer' },
      { name: '孙海博', role: 'Geospatial Engineer', avatar: '' },
      { name: '郑智允', role: 'Full Stack Engineer', avatar: '' },
      { name: '李今希', role: 'Full Stack Engineer', avatar: '' },
    ],
  },
  {
    year: '初创',
    members: [
      { name: '王勇亮', role: 'Founder', github: 'wyl-b', avatar: '' },
      { ...li, role: 'Founding Engineer' },
      { ...zhou, role: 'Founding Engineer' },
      { ...xu, role: 'Founding Engineer' },
      { ...yang, role: 'Founding Engineer' },
    ],
  },
];

export const aboutAvatarInterval = { default: 24, min: 1, max: 720 } as const;

export function aboutAvatarSource(member: AboutMember) {
  const avatar = member.avatar.trim();
  if (!avatar) {
    const username = member.github?.trim();
    return username
      ? {
          kind: 'remote' as const,
          url: `https://github.com/${encodeURIComponent(username)}.png?size=96`,
        }
      : null;
  }
  if (avatar.startsWith('//') || avatar.includes('\\')) return null;
  const localOrigin = 'https://avatar.invalid';
  try {
    const url = new URL(avatar, localOrigin);
    if (
      !/^[a-z][a-z\d+.-]*:/i.test(avatar) &&
      url.origin === localOrigin &&
      !url.pathname.startsWith('//')
    )
      return { kind: 'local' as const, url: url.pathname + url.search };
    if (/^https?:\/\//i.test(avatar) && !url.username && !url.password) {
      url.hash = '';
      return { kind: 'remote' as const, url: url.href };
    }
  } catch {
    return null;
  }
  return null;
}
