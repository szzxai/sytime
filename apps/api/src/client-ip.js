const { BlockList, isIP } = require('node:net');

const normalize = (address) =>
  typeof address === 'string' && address.startsWith('::ffff:') && isIP(address.slice(7)) === 4
    ? address.slice(7)
    : address;

// Only explicitly configured proxy addresses may supply a forwarded client address.
function createClientIpResolver(value = '') {
  const trusted = new BlockList();
  for (const entry of value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [raw, prefix, ...extra] = entry.split('/');
    const address = normalize(raw);
    const version = isIP(address);
    if (!version || extra.length || (prefix !== undefined && !/^\d+$/.test(prefix)))
      throw new Error('TRUSTED_PROXIES must contain IP addresses or CIDR ranges');
    const type = version === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) trusted.addAddress(address, type);
    else {
      const bits = Number(prefix);
      if (bits > (version === 4 ? 32 : 128)) throw new Error('Invalid TRUSTED_PROXIES CIDR');
      trusted.addSubnet(address, bits, type);
    }
  }
  const isTrusted = (address) => {
    const version = isIP(address);
    return !!version && trusted.check(address, version === 4 ? 'ipv4' : 'ipv6');
  };
  return (c) => {
    const peer = normalize(c.env?.incoming?.socket?.remoteAddress || 'local');
    if (!isTrusted(peer)) return peer;
    const forwarded = c.req.header('X-Forwarded-For');
    if (!forwarded) return peer;
    const chain = forwarded.split(',').map((s) => normalize(s.trim()));
    if (chain.length > 32 || chain.some((address) => !isIP(address))) return peer;
    let address = peer;
    for (let i = chain.length - 1; i >= 0 && isTrusted(address); i--) address = chain[i];
    return address;
  };
}

module.exports = { createClientIpResolver };
