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

import { asElement, isHTMLElement } from "../lib/pdfjs-dom";

import TipContainer from "./TipContainer";
import Selection from "./Selection";

import { scaledToViewport } from "../lib/coordinates";

import type {
  IHighlight,
  NewHighlight,
  Position,
  SelectionType,
} from "../types";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Highlights } from "./Highlights";

interface Props<T_HT> {
  categoryLabels: Array<{ label: string; background: string }>;
  highlights: Array<T_HT>;
  onScrollChange: () => void;
  scrollRef: (scrollTo: (highlight: IHighlight) => void) => void;
  pdfDocument: PDFDocumentProxy;
  pdfScaleValue: string;
  setSelectionType: (value: SelectionType) => void;
  selectionType: SelectionType;
  getPageCount: (pageCount: number) => void;
  getCurrentPage: (currentPage: number) => void;
  destinationPage?: number;
  style?: CSSProperties;
  addHighlight: (highlight: NewHighlight) => void;
}

const EMPTY_ID = "empty-id";

export const PdfHighlighter = ({
  addHighlight,
  categoryLabels,
  highlights,
  onScrollChange,
  scrollRef,
  pdfDocument,
  pdfScaleValue = "auto",
  setSelectionType,
  selectionType,
  getPageCount,
  getCurrentPage,
  destinationPage,
  style,
}: Props<IHighlight>) => {
  const [scrolledToHighlightId, setScrolledToHighlightId] =
    useState<string>(EMPTY_ID);
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
              visiblePages={visiblePages}
              scrolledToHighlightId={scrolledToHighlightId}
              categoryLabels={categoryLabels}
              setTip={setTip}
              hideTip={hideTipAndSelection}
              updateHighlight={(highlightId, position, content) => {}}
            />
            <Selection
              viewer={viewer.current}
              selectionType={selectionType}
              onTextSelectionFailure={() => setSelectionType("area")}
              container={containerNode.current}
              addHighlight={addHighlight}
              categoryLabels={categoryLabels}
              hideTip={hideTipAndSelection}
              setTip={setTip}
              onReset={() => setSelectionType("")}
            />
          </>
        )}
      </div>
    </div>
  );
};
