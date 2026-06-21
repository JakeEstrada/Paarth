import { Fragment } from 'react';
import { Box, Typography } from '@mui/material';

function renderInlineMarkdown(text: string) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`b-${idx}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`t-${idx}`}>{part}</Fragment>;
  });
}

export function renderSummaryBlocks(text: string) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks: JSX.Element[] = [];
  let i = 0;

  const headingVariant = (level: number) => {
    if (level <= 2) return 'h6';
    if (level === 3) return 'subtitle1';
    return 'subtitle2';
  };

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <Typography
          key={`h-${i}`}
          variant={headingVariant(level) as 'h6' | 'subtitle1' | 'subtitle2'}
          sx={{ fontWeight: 700, mt: level <= 2 ? 1.5 : 1, mb: 0.5 }}
        >
          {renderInlineMarkdown(heading[2])}
        </Typography>
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <Box key={`ul-${i}`} component="ul" sx={{ mt: 0.25, mb: 1.25, pl: 2.5 }}>
          {items.map((item, idx) => (
            <Box key={idx} component="li" sx={{ mb: 0.4 }}>
              <Typography variant="body2">{renderInlineMarkdown(item)}</Typography>
            </Box>
          ))}
        </Box>
      );
      continue;
    }

    blocks.push(
      <Typography key={`p-${i}`} variant="body2" sx={{ mb: 0.9 }}>
        {renderInlineMarkdown(line)}
      </Typography>
    );
    i += 1;
  }

  if (blocks.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No summary text returned.
      </Typography>
    );
  }

  return blocks;
}
