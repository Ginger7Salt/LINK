export type MemorySummaryBlock =
  | { id: string; kind: 'heading'; content: string }
  | { id: string; kind: 'field'; label: string; content: string }
  | { id: string; kind: 'event'; time: string; fields: Array<{ label: string; content: string }> }
  | { id: string; kind: 'paragraph'; content: string }
  | { id: string; kind: 'list'; items: string[] }
  | { id: string; kind: 'table'; headers: string[]; rows: string[][] }
  | { id: string; kind: 'graph'; nodes: MemorySummaryGraphNode[]; edges: MemorySummaryGraphEdge[]; source: string }
  | { id: string; kind: 'code'; language: string; content: string };

type MemorySummaryBlockInput =
  | { kind: 'heading'; content: string }
  | { kind: 'field'; label: string; content: string }
  | { kind: 'event'; time: string; fields: Array<{ label: string; content: string }> }
  | { kind: 'paragraph'; content: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'graph'; nodes: MemorySummaryGraphNode[]; edges: MemorySummaryGraphEdge[]; source: string }
  | { kind: 'code'; language: string; content: string };

export interface MemorySummaryGraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface MemorySummaryGraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function splitTableLine(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitTableLine(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableStart(lines: string[], index: number) {
  return lines[index]?.trim().startsWith('|') && isMarkdownTableSeparator(lines[index + 1] ?? '');
}

function createBlockId(index: number, kind: MemorySummaryBlock['kind']) {
  return `${kind}-${index}`;
}

function cleanGraphNodeLabel(value: string) {
  return value
    .trim()
    .replace(/^subgraph\s+/i, '')
    .replace(/[\[\]{}()]/g, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function parseMermaidEdge(line: string) {
  const normalizedLine = line.trim();
  if (!normalizedLine || /^(graph|flowchart|subgraph|end\b)/i.test(normalizedLine)) return null;
  const edgeMatch = normalizedLine.match(/^(.+?)\s*(?:--\s*(?:\|?"?([^"|>-]+)"?\|?)?\s*--?>|--?>)\s*(.+)$/);
  if (!edgeMatch) return null;
  return {
    from: cleanGraphNodeLabel(edgeMatch[1]),
    label: String(edgeMatch[2] ?? '').trim(),
    to: cleanGraphNodeLabel(edgeMatch[3])
  };
}

function parseMermaidGraph(content: string) {
  const edges = content
    .split('\n')
    .map(parseMermaidEdge)
    .filter((edge): edge is { from: string; label: string; to: string } => Boolean(edge && edge.from && edge.to));
  if (!edges.length) return null;
  const labels = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
  const centerX = 220;
  const centerY = 140;
  const radiusX = labels.length <= 2 ? 116 : 158;
  const radiusY = labels.length <= 2 ? 0 : 92;
  const nodes = labels.map((label, index): MemorySummaryGraphNode => {
    const angle = labels.length <= 1 ? 0 : (-Math.PI / 2) + (index * 2 * Math.PI / labels.length);
    return {
      id: `node-${index}`,
      label,
      x: Math.round(centerX + Math.cos(angle) * radiusX),
      y: Math.round(centerY + Math.sin(angle) * radiusY)
    };
  });
  const nodeIds = new Map(nodes.map((node) => [node.label, node.id]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return {
    nodes,
    edges: edges.map((edge, index): MemorySummaryGraphEdge | null => {
      const from = nodeIds.get(edge.from) ?? '';
      const to = nodeIds.get(edge.to) ?? '';
      const fromNode = nodeById.get(from);
      const toNode = nodeById.get(to);
      if (!fromNode || !toNode) return null;
      return {
        id: `edge-${index}`,
        from,
        to,
        label: edge.label,
        x1: fromNode.x,
        y1: fromNode.y,
        x2: toNode.x,
        y2: toNode.y
      };
    }).filter((edge): edge is MemorySummaryGraphEdge => Boolean(edge))
  };
}

export function parseMemorySummaryBlocks(summary: string): MemorySummaryBlock[] {
  const lines = summary
    .replace(/\r\n/g, '\n')
    .replace(/<\/?profile>/gi, '')
    .replace(/<\/?details>/gi, '')
    .replace(/<summary>(.*?)<\/summary>/gi, '\n$1\n')
    .trim()
    .split('\n');
  const blocks: MemorySummaryBlock[] = [];
  const paragraphLines: string[] = [];
  let lineIndex = 0;

  const pushBlock = (block: MemorySummaryBlockInput) => {
    blocks.push({ ...block, id: createBlockId(blocks.length, block.kind) } as MemorySummaryBlock);
  };
  const flushParagraph = () => {
    const content = paragraphLines.join(' ').replace(/\s+/g, ' ').trim();
    if (content) pushBlock({ kind: 'paragraph', content });
    paragraphLines.length = 0;
  };

  while (lineIndex < lines.length) {
    const rawLine = lines[lineIndex] ?? '';
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      lineIndex += 1;
      continue;
    }

    if (/^plaintext$/i.test(line)) {
      flushParagraph();
      lineIndex += 1;
      continue;
    }

    if (line.startsWith('```')) {
      flushParagraph();
      const language = line.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      lineIndex += 1;
      while (lineIndex < lines.length && !lines[lineIndex].trim().startsWith('```')) {
        codeLines.push(lines[lineIndex]);
        lineIndex += 1;
      }
      if (lineIndex < lines.length) lineIndex += 1;
      const content = codeLines.join('\n').trim();
      const graph = language.toLowerCase().includes('mermaid') ? parseMermaidGraph(content) : null;
      pushBlock(graph ? { kind: 'graph', source: content, ...graph } : { kind: 'code', language, content });
      continue;
    }

    if (isMarkdownTableStart(lines, lineIndex)) {
      flushParagraph();
      const headers = splitTableLine(lines[lineIndex]);
      lineIndex += 2;
      const rows: string[][] = [];
      while (lineIndex < lines.length && lines[lineIndex].trim().startsWith('|')) {
        rows.push(splitTableLine(lines[lineIndex]));
        lineIndex += 1;
      }
      pushBlock({ kind: 'table', headers, rows });
      continue;
    }

    const eventMatch = line.match(/^[-*]\s*时间[：:]\s*(.*)$/);
    if (eventMatch) {
      flushParagraph();
      const fields: Array<{ label: string; content: string }> = [];
      const time = eventMatch[1].trim() || '时间未标注';
      lineIndex += 1;
      while (lineIndex < lines.length) {
        const nextLine = lines[lineIndex] ?? '';
        const trimmedNextLine = nextLine.trim();
        if (!trimmedNextLine) {
          lineIndex += 1;
          continue;
        }
        if (/^[-*]\s*时间[：:]/.test(trimmedNextLine) || /^<summary>/i.test(trimmedNextLine) || isMarkdownTableStart(lines, lineIndex) || trimmedNextLine.startsWith('```')) break;
        const fieldLineMatch = nextLine.match(/^\s*[-*]\s*([^：:]+)[：:]\s*(.*)$/);
        if (!fieldLineMatch) break;
        fields.push({ label: fieldLineMatch[1].trim(), content: fieldLineMatch[2].trim() });
        lineIndex += 1;
      }
      pushBlock({ kind: 'event', time, fields });
      continue;
    }

    const listMatch = line.match(/^(?:[-*]\s+|\d+[.、]\s*)(.+)$/);
    if (listMatch) {
      flushParagraph();
      const items: string[] = [];
      while (lineIndex < lines.length) {
        const itemMatch = lines[lineIndex].trim().match(/^(?:[-*]\s+|\d+[.、]\s*)(.+)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1].trim());
        lineIndex += 1;
      }
      pushBlock({ kind: 'list', items });
      continue;
    }

    const fieldMatch = line.match(/^([\w\u4e00-\u9fa5]+)[：:]\s*(.*)$/);
    if (fieldMatch) {
      flushParagraph();
      const label = fieldMatch[1].trim();
      const content = fieldMatch[2].trim();
      pushBlock(content ? { kind: 'field', label, content } : { kind: 'heading', content: label });
      lineIndex += 1;
      continue;
    }

    if (line.length <= 24 && !/[，。,.]/.test(line)) {
      flushParagraph();
      pushBlock({ kind: 'heading', content: line });
      lineIndex += 1;
      continue;
    }

    paragraphLines.push(line);
    lineIndex += 1;
  }

  flushParagraph();
  return blocks;
}