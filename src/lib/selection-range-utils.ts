import { PDFViewer } from "pdfjs-dist/web/pdf_viewer";
import {
  asElement,
  findOrCreateContainerLayer,
  getPageFromElement,
  getPagesFromRange,
  getWindow,
  isHTMLElement,
} from "./pdfjs-dom";

export const getTextNodesInRange = (range: Range) => {
  const container = range.commonAncestorContainer;

  if (container instanceof Text) {
    return [container];
  }
  const walk = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    (node) => {
      if (range.intersectsNode(node)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    }
  );
  const textNodes = [];
  while (walk.nextNode()) {
    textNodes.push(walk.currentNode);
  }
  return textNodes;
};

export const getClientRectsInRange = (range: Range) => {
  const textNodes = getTextNodesInRange(range);
  if (textNodes.length === 0) {
    console.warn("no text nodes found");
    return [];
  }

  const clientRects = [];
  // text nodes don't have getBoundingClientRect, so we need to create a range
  let tempRange = document.createRange();
  let textNode;
  for (let idx = 0; idx < textNodes.length; idx++) {
    textNode = textNodes[idx];

    tempRange.selectNode(textNode);
    if (idx === 0) {
      tempRange.setStart(textNode, range.startOffset);
    }
    if (idx === textNodes.length - 1) {
      tempRange.setEnd(textNode, range.endOffset);
    }

    clientRects.push(tempRange.getBoundingClientRect());
  }

  return clientRects;
};

export function addMissingSpacesToSelection(range: Range) {
  const { startContainer, endContainer, endOffset, startOffset } = range;

  const stringifiedRange = getTextNodesInRange(range)
    .map((textNode) => textNode.textContent + " ")
    .filter((str) => !/^\s*$/.test(str))
    .join("");

  /*
  We need to determine where to slice depending on whether the first and last nodes
  are text nodes or not. Text nodes comes with an offset, other nodes do not.
  */
  const startIndex = startContainer instanceof Text ? startOffset : 0;
  const endIndex =
    endContainer instanceof Text
      ? stringifiedRange.length - endContainer.length + endOffset
      : undefined;

  return stringifiedRange.slice(startIndex, endIndex).trim();
}

/** At first, we try to find the text node and offset with point related API methods */
export const getTextAtPoint = (e: PointerEvent) => {
  let textNode: Text | null = null;
  let offset: number = 0;
  //@ts-ignore - ts doesn't know about Firefox specific caretPositionFromPoint
  if (document.caretPositionFromPoint) {
    //@ts-ignore
    const caretPosition: any = document.caretPositionFromPoint(
      e.clientX,
      e.clientY
    );
    if (caretPosition && caretPosition.offsetNode instanceof Text) {
      textNode = caretPosition.offsetNode;
      offset = caretPosition.offset;
    }
  } else if (document.caretRangeFromPoint) {
    // Use WebKit-proprietary fallback method
    const caretRange = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (caretRange && caretRange.startContainer instanceof Text) {
      textNode = caretRange.startContainer;
      offset = caretRange.startOffset;
    }
  } else {
    const textNodeFromPoint = document.elementFromPoint(
      e.clientX,
      e.clientY
    )?.firstChild;

    if (textNodeFromPoint instanceof Text) {
      textNode = textNodeFromPoint;
    }
  }

  return { textNode, offset };
};

/**If no text node is found, find the first text node below the pointer */
export const getNextTextNode = (e: PointerEvent, viewer: PDFViewer) => {
  // TODO: use target to get text layer
  const textLayer = viewer.getPageView(viewer.currentPageNumber - 1).textLayer
    ?.div;
  if (!textLayer) {
    return null;
  }

  let textNode: Text | null = null;
  let textRect: DOMRect;

  const tempRange = document.createRange();
  const walk = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  // TODO: move backwards if direction is up
  while (walk.nextNode()) {
    // We need to create a range to get the bounding rect of the text node
    tempRange.selectNode(walk.currentNode);
    textRect = tempRange.getBoundingClientRect();
    if (textRect.top > e.clientY) {
      textNode = walk.currentNode as Text;
      break;
    }
  }
  return textNode;
};

/** Get the text node and offset at the pointer position */
export const getTextNodeAndOffset = (e: PointerEvent, viewer: PDFViewer) => {
  const { textNode, offset } = getTextAtPoint(e);

  return { textNode: textNode || getNextTextNode(e, viewer), offset };
};
