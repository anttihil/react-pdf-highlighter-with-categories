import React, {
  CSSProperties,
  PointerEventHandler,
  PureComponent,
} from "react";
import { Root, createRoot } from "react-dom/client";
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

import getAreaAsPng from "../lib/get-area-as-png";

import {
  asElement,
  findOrCreateContainerLayer,
  getPageFromElement,
  isHTMLElement,
} from "../lib/pdfjs-dom";

import TipContainer from "./TipContainer";
import Selection from "./Selection";

import { scaledToViewport, viewportToScaled } from "../lib/coordinates";

import type {
  IHighlight,
  LTWH,
  LTWHP,
  Position,
  Scaled,
  ScaledPosition,
  SelectionType,
} from "../types";
import type { PDFDocumentProxy } from "pdfjs-dist";

type T_ViewportHighlight<T_HT> = { position: Position } & T_HT;

interface State<T_HT> {
  ghostHighlight: {
    position: ScaledPosition;
    content?: { text?: string; image?: string };
  } | null;
  isCollapsed: boolean;
  tip: {
    highlight: T_ViewportHighlight<T_HT>;
    callback: (highlight: T_ViewportHighlight<T_HT>) => JSX.Element;
  } | null;
  tipPosition: Position | null;
  tipChildren: JSX.Element | null;
  isAreaSelectionInProgress: boolean;
  scrolledToHighlightId: string;
}

interface Props<T_HT> {
  categoryLabels: Array<{ label: string; background: string }>;
  highlightTransform: (
    highlight: T_ViewportHighlight<T_HT>,
    index: number,
    setTip: (
      highlight: T_ViewportHighlight<T_HT>,
      callback: (highlight: T_ViewportHighlight<T_HT>) => JSX.Element
    ) => void,
    hideTip: () => void,
    viewportToScaled: (rect: LTWHP) => Scaled,
    screenshot: (position: LTWH) => string,
    isScrolledTo: boolean
  ) => JSX.Element;
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

export class PdfHighlighter<T_HT extends IHighlight> extends PureComponent<
  Props<T_HT>,
  State<T_HT>
> {
  static defaultProps = {
    pdfScaleValue: "auto",
  };

  state: State<T_HT> = {
    ghostHighlight: null,
    isCollapsed: true,
    scrolledToHighlightId: EMPTY_ID,
    isAreaSelectionInProgress: false,
    tip: null,
    tipPosition: null,
    tipChildren: null,
  };

  eventBus = new EventBus();
  linkService = new PDFLinkService({
    eventBus: this.eventBus,
    externalLinkTarget: 2,
  });

  viewer!: PDFViewer;

  resizeObserver: ResizeObserver | null = null;
  containerNode: HTMLDivElement | null = null;
  viewerNode: HTMLDivElement | null = null;

  unsubscribe = () => {};

  highlightLayerRoots: Array<Root | null> = [];

  constructor(props: Props<T_HT>) {
    super(props);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.debouncedScaleValue);
    }
  }

  componentDidMount() {
    this.init();
  }

  attachRef = (ref: HTMLDivElement | null) => {
    const { eventBus, resizeObserver: observer } = this;
    this.containerNode = ref;
    this.unsubscribe();

    if (ref) {
      const { ownerDocument: doc } = ref;
      eventBus.on("textlayerrendered", this.onTextLayerRendered);
      eventBus.on("pagesinit", this.onDocumentReady);
      eventBus.on("pagechanging", this.onPageChange);
      doc.addEventListener("keydown", this.handleKeyDown);
      doc.defaultView?.addEventListener("resize", this.debouncedScaleValue);
      if (observer) observer.observe(ref);

      this.unsubscribe = () => {
        eventBus.off("pagesinit", this.onDocumentReady);
        eventBus.off("textlayerrendered", this.onTextLayerRendered);
        eventBus.off("pagechanging", this.onPageChange);
        doc.removeEventListener("keydown", this.handleKeyDown);
        doc.defaultView?.removeEventListener(
          "resize",
          this.debouncedScaleValue
        );
        if (observer) observer.disconnect();
      };
    }
  };

  componentDidUpdate(prevProps: Props<T_HT>) {
    if (prevProps.pdfDocument !== this.props.pdfDocument) {
      this.init();
      return;
    }
    if (prevProps.highlights !== this.props.highlights) {
      this.renderHighlights(this.props);
    }
    const page = this.props.destinationPage;
    if (page && prevProps.destinationPage !== page) {
      this.goToPage(page);
    }

    if (prevProps.pdfScaleValue !== this.props.pdfScaleValue) {
      this.handleScaleValue();
    }
  }

  init() {
    const { pdfDocument } = this.props;

    this.viewer =
      this.viewer ||
      new PDFViewer({
        container: this.containerNode!,
        eventBus: this.eventBus,
        // enhanceTextSelection: true, // deprecated. https://github.com/mozilla/pdf.js/issues/9943#issuecomment-409369485
        textLayerMode: 2,
        removePageBorders: true,
        linkService: this.linkService,
        l10n: NullL10n,
      });

    this.linkService.setDocument(pdfDocument);
    this.linkService.setViewer(this.viewer);
    this.viewer.setDocument(pdfDocument);
    // debug
    (window as any).PdfViewer = this;
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  findOrCreateHighlightLayer(page: number) {
    const { textLayer } = this.viewer.getPageView(page - 1) || {};

    if (!textLayer) {
      return null;
    }

    return findOrCreateContainerLayer(
      textLayer.div,
      "PdfHighlighter__highlight-layer"
    );
  }

  goToPage(page: number) {
    if (page < 1 || page > this.viewer.pagesCount) {
      return;
    }
    this.viewer.currentPageNumber = page;
  }

  groupHighlightsByPage(highlights: Array<T_HT>): {
    [pageNumber: string]: Array<T_HT>;
  } {
    const { ghostHighlight } = this.state;

    const allHighlights = [...highlights, ghostHighlight].filter(Boolean);

    const pageNumbers = new Set<number>();
    for (const highlight of allHighlights) {
      pageNumbers.add(highlight!.position.pageNumber);
      for (const rect of highlight!.position.rects) {
        if (rect.pageNumber) {
          pageNumbers.add(rect.pageNumber);
        }
      }
    }

    const groupedHighlights = {} as Record<number, any[]>;

    for (const pageNumber of pageNumbers) {
      groupedHighlights[pageNumber] = groupedHighlights[pageNumber] || [];
      for (const highlight of allHighlights) {
        const pageSpecificHighlight = {
          ...highlight,
          position: {
            pageNumber,
            boundingRect: highlight!.position.boundingRect,
            rects: [],
            usePdfCoordinates: highlight!.position.usePdfCoordinates,
          } as ScaledPosition,
        };
        let anyRectsOnPage = false;
        for (const rect of highlight!.position.rects) {
          if (
            pageNumber === (rect.pageNumber || highlight!.position.pageNumber)
          ) {
            pageSpecificHighlight.position.rects.push(rect);
            anyRectsOnPage = true;
          }
        }
        if (anyRectsOnPage || pageNumber === highlight!.position.pageNumber) {
          groupedHighlights[pageNumber].push(pageSpecificHighlight);
        }
      }
    }

    return groupedHighlights;
  }

  showTip(highlight: T_ViewportHighlight<T_HT>, content: JSX.Element) {
    const { isCollapsed, ghostHighlight, isAreaSelectionInProgress } =
      this.state;

    const highlightInProgress = !isCollapsed || ghostHighlight;

    if (highlightInProgress || isAreaSelectionInProgress) {
      return;
    }

    this.setTip(highlight.position, content);
  }

  scaledPositionToViewport({
    pageNumber,
    boundingRect,
    rects,
    usePdfCoordinates,
  }: ScaledPosition): Position {
    const viewport = this.viewer.getPageView(pageNumber - 1).viewport;

    return {
      boundingRect: scaledToViewport(boundingRect, viewport, usePdfCoordinates),
      rects: (rects || []).map((rect) =>
        scaledToViewport(rect, viewport, usePdfCoordinates)
      ),
      pageNumber,
    };
  }

  viewportPositionToScaled({
    pageNumber,
    boundingRect,
    rects,
  }: Position): ScaledPosition {
    const viewport = this.viewer.getPageView(pageNumber - 1).viewport;

    return {
      boundingRect: viewportToScaled(boundingRect, viewport),
      rects: (rects || []).map((rect) => viewportToScaled(rect, viewport)),
      pageNumber,
    };
  }

  screenshot(position: LTWH, pageNumber: number) {
    const canvas = this.viewer.getPageView(pageNumber - 1).canvas;

    return getAreaAsPng(canvas, position);
  }

  renderHighlights(nextProps?: Props<T_HT>) {
    const { highlightTransform, highlights } = nextProps || this.props;

    const { pdfDocument } = this.props;

    const { tip, scrolledToHighlightId } = this.state;

    const highlightsByPage = this.groupHighlightsByPage(highlights);

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      const highlightLayer = this.findOrCreateHighlightLayer(pageNumber);

      if (!highlightLayer) {
        this.highlightLayerRoots[pageNumber] = null;
        continue;
      }

      if (!this.highlightLayerRoots[pageNumber]) {
        this.highlightLayerRoots[pageNumber] = createRoot(highlightLayer);
      }

      this.highlightLayerRoots[pageNumber]!.render(
        <div>
          {(highlightsByPage[String(pageNumber)] || []).map(
            ({ position, id, ...highlight }, index) => {
              // @ts-ignore
              const viewportHighlight: T_ViewportHighlight<T_HT> = {
                id,
                position: this.scaledPositionToViewport(position),
                ...highlight,
              };

              if (tip && tip.highlight.id === String(id)) {
                this.showTip(tip.highlight, tip.callback(viewportHighlight));
              }

              const isScrolledTo = Boolean(scrolledToHighlightId === id);

              return highlightTransform(
                viewportHighlight,
                index,
                (highlight, callback) => {
                  this.setState({
                    tip: { highlight, callback },
                  });

                  this.showTip(highlight, callback(highlight));
                },
                this.hideTipAndSelection,
                (rect) => {
                  const viewport = this.viewer.getPageView(
                    (rect.pageNumber || pageNumber) - 1
                  ).viewport;

                  return viewportToScaled(rect, viewport);
                },
                (boundingRect) => this.screenshot(boundingRect, pageNumber),
                isScrolledTo
              );
            }
          )}
        </div>
      );
    }
  }

  hideTipAndSelection = () => {
    this.setState({
      tipPosition: null,
      tipChildren: null,
    });

    this.setState({ ghostHighlight: null, tip: null }, () =>
      this.renderHighlights()
    );
  };

  setTip(position: Position, inner: JSX.Element | null) {
    this.setState({
      tipPosition: position,
      tipChildren: inner,
    });
  }

  onTextLayerRendered = () => {
    this.renderHighlights();
  };

  scrollTo = (highlight: IHighlight) => {
    const { pageNumber, boundingRect, usePdfCoordinates } = highlight.position;

    this.viewer.container.removeEventListener("scroll", this.onScroll);

    const pageViewport = this.viewer.getPageView(pageNumber - 1).viewport;

    const scrollMargin = 10;

    this.viewer.scrollPageIntoView({
      pageNumber,
      destArray: [
        null,
        { name: "XYZ" },
        ...pageViewport.convertToPdfPoint(
          0,
          scaledToViewport(boundingRect, pageViewport, usePdfCoordinates).top -
            scrollMargin
        ),
        0,
      ],
    });

    this.setState(
      {
        scrolledToHighlightId: highlight.id,
      },
      () => this.renderHighlights()
    );

    // wait for scrolling to finish
    setTimeout(() => {
      this.viewer.container.addEventListener("scroll", this.onScroll);
    }, 100);
  };

  onDocumentReady = () => {
    const { scrollRef } = this.props;

    this.handleScaleValue();

    scrollRef(this.scrollTo);

    this.props.getPageCount(this.viewer.pagesCount);
  };

  onPageChange = () => this.props.getCurrentPage(this.viewer.currentPageNumber);

  onScroll = () => {
    const { onScrollChange } = this.props;

    onScrollChange();

    this.setState(
      {
        scrolledToHighlightId: EMPTY_ID,
      },
      () => this.renderHighlights()
    );

    this.viewer.container.removeEventListener("scroll", this.onScroll);
  };

  onMouseDown: PointerEventHandler = (event) => {
    if (!isHTMLElement(event.target)) {
      return;
    }

    if (asElement(event.target).closest(".PdfHighlighter__tip-container")) {
      return;
    }

    this.hideTipAndSelection();
  };

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") {
      this.hideTipAndSelection();
    }
  };

  handleScaleValue = () => {
    if (this.viewer) {
      this.viewer.currentScaleValue = this.props.pdfScaleValue; //"page-width";
    }
  };

  debouncedScaleValue: () => void = debounce(this.handleScaleValue, 500);

  render() {
    const {
      onSelectionFinished,
      selectionType,
      categoryLabels,
      setSelectionType,
    } = this.props;
    return (
      <div onPointerDown={this.onMouseDown}>
        <div
          ref={this.attachRef}
          className="PdfHighlighter"
          onContextMenu={(e) => e.preventDefault()}
          style={this.props.style}
        >
          <div
            className="pdfViewer"
            ref={(ref) => {
              this.viewerNode = ref;
              ref?.addEventListener("selectstart", (e) => {
                e.preventDefault();
              }); // disable text selection
            }}
          />
          <TipContainer
            tipPosition={this.state.tipPosition}
            viewer={this.viewer}
          >
            {this.state.tipChildren}
          </TipContainer>
          <Selection
            viewer={this.viewer}
            selectionType={selectionType}
            onTextSelectionFailure={() => setSelectionType("area")}
            container={this.containerNode}
            categoryLabels={categoryLabels}
            onChange={(isVisible) =>
              this.setState({ isAreaSelectionInProgress: isVisible })
            }
            onTextSelectionChange={(
              viewportPosition: Position,
              scaledPosition: ScaledPosition,
              content: { text: string }
            ) => {
              this.setTip(
                viewportPosition,
                onSelectionFinished(
                  scaledPosition,
                  content,
                  () => this.hideTipAndSelection(),
                  () =>
                    this.setState(
                      {
                        ghostHighlight: { position: scaledPosition },
                      },
                      () => this.renderHighlights()
                    ),
                  this.props.categoryLabels
                )
              );
            }}
            onReset={() => setSelectionType("")}
            onSelection={(
              startTarget,
              boundingRect,
              resetSelection,
              cLabels
            ) => {
              const page = getPageFromElement(startTarget);
              if (!page) {
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

              const scaledPosition =
                this.viewportPositionToScaled(viewportPosition);

              const image = this.screenshot(
                pageBoundingRect,
                pageBoundingRect.pageNumber
              );

              this.setTip(
                viewportPosition,
                onSelectionFinished(
                  scaledPosition,
                  { image },
                  () => this.hideTipAndSelection(),
                  () =>
                    this.setState(
                      {
                        ghostHighlight: {
                          position: scaledPosition,
                          content: { image },
                        },
                      },
                      () => {
                        resetSelection();
                        this.renderHighlights();
                      }
                    ),
                  cLabels
                )
              );
            }}
          />
        </div>
      </div>
    );
  }
}
