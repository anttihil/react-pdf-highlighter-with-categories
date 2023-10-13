import React, {
  CSSProperties,
  PointerEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import debounce from "lodash.debounce";

import {
  EventBus,
  NullL10n,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer";

import "pdfjs-dist/web/pdf_viewer.css";
import "../style/pdf_viewer.css";

import "../style/PdfHighlighter.css";

import { asElement, getPageFromElement, isHTMLElement } from "../lib/pdfjs-dom";

import TipContainer from "./TipContainer";
import Selection from "./Selection";

import { scaledToViewport } from "../lib/coordinates";

import type {
  IHighlight,
  Position,
  ScaledPosition,
  SelectionType,
} from "../types";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { viewportPositionToScaled } from "../lib/position-conversion";
import { screenshot } from "../lib/screenshot";
import { Highlights } from "./Highlights";

interface Props<T_HT> {
  categoryLabels: Array<{ label: string; background: string }>;
  highlights: Array<T_HT>;
  onScrollChange: () => void;
  scrollRef: (scrollTo: (highlight: IHighlight) => void) => void;
  pdfDocument: PDFDocumentProxy;
  pdfScaleValue: string;
  onSelectionFinished: (
    position: ScaledPosition,
    content: { text?: string; image?: string },
    hideTipAndSelection: () => void,
    transformSelection: () => void,
    categoryLabels: Array<{ label: string; background: string }>
  ) => JSX.Element | null;
  setSelectionType: (value: SelectionType) => void;
  selectionType: SelectionType;
  getPageCount: (pageCount: number) => void;
  getCurrentPage: (currentPage: number) => void;
  destinationPage?: number;
  style?: CSSProperties;
}

const EMPTY_ID = "empty-id";

export const PdfHighlighter = ({
  categoryLabels,
  highlights,
  onScrollChange,
  scrollRef,
  pdfDocument,
  pdfScaleValue = "auto",
  onSelectionFinished,
  setSelectionType,
  selectionType,
  getPageCount,
  getCurrentPage,
  destinationPage,
  style,
}: Props<IHighlight>) => {
  const [ghostHighlight, setGhostHighlight] = useState<{
    position: ScaledPosition;
    content?: { text?: string; image?: string };
  } | null>(null);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [scrolledToHighlightId, setScrolledToHighlightId] =
    useState<string>(EMPTY_ID);
  const [isAreaSelectionInProgress, setIsAreaSelectionInProgress] =
    useState<boolean>(false);
  const [tip, setTip] = useState<{
    position: Position | null;
    inner: JSX.Element | null;
  }>({ position: null, inner: null });
  const [visiblePages, setVisiblePages] = useState<number[]>([]);

  const [isDocumentReady, setIsDocumentReady] = useState<boolean>(false);

  const eventBus = useRef(new EventBus());
  const linkService = useRef(
    new PDFLinkService({
      eventBus: eventBus.current,
      externalLinkTarget: 2,
    })
  );

  const viewer = useRef<PDFViewer | null>(null);

  const resizeObserver = useRef<ResizeObserver | null>();
  const containerNode = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pdfDocument || !containerNode.current) {
      return;
    }
    viewer.current = new PDFViewer({
      container: containerNode.current,
      eventBus: eventBus.current,
      textLayerMode: 2,
      removePageBorders: true,
      linkService: linkService.current,
      l10n: NullL10n,
    });

    linkService.current.setDocument(pdfDocument);
    linkService.current.setViewer(viewer.current);
    viewer.current.setDocument(pdfDocument);
    viewer.current.viewer?.classList.toggle(
      "PdfHighlighter--disable-selection",
      true
    );
  }, [pdfDocument]);

  const handleScaleValue = useCallback(() => {
    if (!viewer.current) return;
    viewer.current.currentScaleValue = pdfScaleValue; //"page-width";
  }, [viewer.current, pdfScaleValue]);

  useEffect(() => {
    if (!containerNode.current) return;

    const onScroll = () => {
      if (!viewer.current) return;
      onScrollChange();

      setScrolledToHighlightId(EMPTY_ID);

      viewer.current.container.removeEventListener("scroll", onScroll);
    };

    const scrollTo = (highlight: IHighlight) => {
      const pdfViewer = viewer.current;
      if (!pdfViewer) return;
      const { pageNumber, boundingRect, usePdfCoordinates } =
        highlight.position;

      pdfViewer.container.removeEventListener("scroll", onScroll);

      const pageViewport = pdfViewer.getPageView(pageNumber - 1).viewport;

      const scrollMargin = 10;

      pdfViewer.scrollPageIntoView({
        pageNumber,
        destArray: [
          null,
          { name: "XYZ" },
          ...pageViewport.convertToPdfPoint(
            0,
            scaledToViewport(boundingRect, pageViewport, usePdfCoordinates)
              .top - scrollMargin
          ),
          0,
        ],
      });

      setScrolledToHighlightId(highlight.id);

      // wait for scrolling to finish
      setTimeout(() => {
        pdfViewer.container.addEventListener("scroll", onScroll);
      }, 100);
    };

    const onDocumentReady = () => {
      if (!viewer.current) return;
      handleScaleValue();

      scrollRef(scrollTo);

      getPageCount(viewer.current.pagesCount);

      setIsDocumentReady(true);
    };

    const onPageChange = () => {
      if (!viewer.current) return;
      getCurrentPage(viewer.current.currentPageNumber);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        hideTipAndSelection();
      }
    };

    const debouncedScaleValue: () => void = debounce(handleScaleValue, 500);

    eventBus.current.on("pagesinit", onDocumentReady);
    eventBus.current.on("pagechanging", onPageChange);
    document.addEventListener("keydown", handleKeyDown);
    document.defaultView?.addEventListener("resize", debouncedScaleValue);
    resizeObserver.current = new ResizeObserver(debouncedScaleValue);
    resizeObserver.current.observe(containerNode.current);

    return () => {
      eventBus.current.off("pagesinit", onDocumentReady);
      eventBus.current.off("pagechanging", onPageChange);
      document.removeEventListener("keydown", handleKeyDown);
      document.defaultView?.removeEventListener("resize", debouncedScaleValue);
      if (resizeObserver.current) resizeObserver.current.disconnect();
    };
  }, [pdfDocument, handleScaleValue, scrollRef, getCurrentPage]);

  useEffect(() => {
    handleScaleValue();
  }, [pdfScaleValue, handleScaleValue]);

  useEffect(() => {
    if (typeof destinationPage !== "number") return;
    if (!viewer.current) return;
    if (destinationPage < 1 || destinationPage > viewer.current.pagesCount)
      return;

    viewer.current.currentPageNumber = destinationPage;
  }, [destinationPage]);

  useEffect(() => {
    if (!viewer.current) return;
    const viewerElem = document.querySelector(".pdfViewer");
    const pages = Array.from(document.querySelectorAll(".page"));

    if (!pages.length) return;
    if (!viewerElem) return;

    // TODO: consider observing only pages that are near the current viewport
    //const currentPageNumber = viewer.current.currentPageNumber;

    //const currentPage = viewer.current.getPageView(currentPageNumber - 1);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNumber = Number(
            entry.target.getAttribute("data-page-number")
          );
          if (entry.isIntersecting) {
            setVisiblePages((prev) => [...prev, pageNumber]);
          } else {
            setVisiblePages((prev) => prev.filter((p) => p !== pageNumber));
          }
        });
      },
      {
        root: document.querySelector("PdfHighlighter"),
        rootMargin: "0px",
        threshold: 0.25,
      }
    );

    pages.forEach((page) => intersectionObserver.observe(page));

    return () => {
      intersectionObserver.disconnect();
    };
  }, [pdfDocument, isDocumentReady]);

  const hideTipAndSelection = () => {
    setTip({
      position: null,
      inner: null,
    });
  };

  const onMouseDown: PointerEventHandler = (event) => {
    if (!isHTMLElement(event.target)) {
      return;
    }

    if (asElement(event.target).closest(".PdfHighlighter__tip-container")) {
      return;
    }

    hideTipAndSelection();
  };

  const selectionInProgress = Boolean(
    !isCollapsed || ghostHighlight || isAreaSelectionInProgress
  );

  return (
    <div onPointerDown={onMouseDown}>
      <div
        ref={containerNode}
        className="PdfHighlighter"
        onContextMenu={(e) => e.preventDefault()}
        style={style}
      >
        <div className="pdfViewer" />
        {viewer.current && containerNode.current && (
          <>
            <TipContainer tipPosition={tip.position} viewer={viewer.current}>
              {tip.inner}
            </TipContainer>

            <Highlights
              viewer={viewer.current}
              highlights={highlights}
              ghostHighlight={ghostHighlight}
              visiblePages={visiblePages}
              scrolledToHighlightId={scrolledToHighlightId}
              categoryLabels={categoryLabels}
              setTip={setTip}
              hideTip={hideTipAndSelection}
              updateHighlight={(highlightId, position, content) => {}}
              selectionInProgress={selectionInProgress}
              popupContent={(highlight) => <HighlightPopup {...highlight} />}
            />

            <Selection
              viewer={viewer.current}
              selectionType={selectionType}
              onTextSelectionFailure={() => setSelectionType("area")}
              container={containerNode.current}
              categoryLabels={categoryLabels}
              onChange={(isVisible) => setIsAreaSelectionInProgress(isVisible)}
              onTextSelectionChange={(
                viewportPosition: Position,
                scaledPosition: ScaledPosition,
                content: { text: string }
              ) => {
                setTip({
                  position: viewportPosition,
                  inner: onSelectionFinished(
                    scaledPosition,
                    content,
                    hideTipAndSelection,
                    () =>
                      setGhostHighlight((prev) => ({
                        ...prev,
                        position: scaledPosition,
                      })),

                    categoryLabels
                  ),
                });
              }}
              onReset={() => setSelectionType("")}
              onSelection={(
                startTarget,
                boundingRect,
                resetSelection,
                cLabels
              ) => {
                const page = getPageFromElement(startTarget);
                if (!page || !viewer.current) {
                  return;
                }

                const pageBoundingRect = {
                  ...boundingRect,
                  top: boundingRect.top - page.node.offsetTop,
                  left: boundingRect.left - page.node.offsetLeft,
                  pageNumber: page.number,
                };

                const viewportPosition = {
                  boundingRect: pageBoundingRect,
                  rects: [],
                  pageNumber: page.number,
                };

                const scaledPosition = viewportPositionToScaled(
                  viewportPosition,
                  viewer.current
                );

                const image = screenshot(
                  pageBoundingRect,
                  pageBoundingRect.pageNumber,
                  viewer.current
                );

                setTip({
                  position: viewportPosition,
                  inner: onSelectionFinished(
                    scaledPosition,
                    { image },
                    () => hideTipAndSelection(),
                    () => {
                      setGhostHighlight((prev) => ({
                        ...prev,
                        position: scaledPosition,
                        content: { image },
                      }));
                      resetSelection();
                    },
                    cLabels
                  ),
                });
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; category: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.category} {comment.text}
    </div>
  ) : null;
