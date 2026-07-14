function includesAny(text, words = []) {
  const lowerText = String(text || '').toLowerCase();
  return words.some(word => lowerText.includes(String(word || '').toLowerCase()));
}

function countPatternMatches(text = '', pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function compactWhitespace(text = '') {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function visualLength(text = '') {
  return Array.from(text).reduce((sum, char) => sum + (/[\x00-\x7F]/.test(char) ? 0.55 : 1), 0);
}

function hardSplitLine(line, maxLength) {
  const parts = [];
  let current = '';
  Array.from(line).forEach((char) => {
    if (visualLength(current + char) > maxLength && current) {
      parts.push(current.trim());
      current = char;
    } else {
      current += char;
    }
  });
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitTweetLine(line, maxLength = 34) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (visualLength(trimmed) <= maxLength) return [trimmed];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];

  const tokens = trimmed.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g) || [trimmed];
  const lines = [];
  let current = '';

  tokens.forEach((token) => {
    const next = `${current}${token}`.trim();
    if (current && visualLength(next) > maxLength) {
      lines.push(current.trim());
      current = token.trim();
    } else {
      current = next;
    }
  });
  if (current.trim()) lines.push(current.trim());

  return lines.flatMap(part => visualLength(part) > maxLength * 1.25 ? hardSplitLine(part, maxLength) : [part]);
}

function formatTweetForX(text = '') {
  const raw = memoryValueToText(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
  if (!raw) return '';

  const paragraphs = raw
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  const formatted = paragraphs.map((paragraph) => {
    const lines = paragraph
      .split('\n')
      .flatMap(line => splitTweetLine(line))
      .filter(Boolean);

    if (!paragraph.includes('\n') && lines.length >= 3) {
      const [hook, ...body] = lines;
      const grouped = [];
      body.forEach((line, index) => {
        grouped.push(line);
        if ((index + 1) % 3 === 0 && index < body.length - 1) grouped.push('');
      });
      return [hook, '', ...grouped].join('\n');
    }

    return lines.join('\n');
  });

  return formatted.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatReplyForX(reply = '') {
  return compactWhitespace(reply)
    .replace(/^回复[:：]\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n')
    .trim();
}
export { countPatternMatches, compactWhitespace, visualLength, hardSplitLine, splitTweetLine, formatTweetForX, formatReplyForX, includesAny, memoryValueToText };

function memoryValueToText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('\n');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ? String(value) : '';
}
