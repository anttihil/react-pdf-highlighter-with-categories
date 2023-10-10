import React, {
  CSSProperties,
  PointerEventHandler,
  PureComponent,
} from "react";
import { Root } from "react-dom/client";
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

import {
  asElement,
  findOrCreateContainerLayer,
  getPageFromElement,
  isHTMLElement,
} from "../lib/pdfjs-dom";

import TipContainer from "./TipContainer";
import Selection from "./Selection";

import { scaledToViewport } from "../lib/coordinates";

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
import { viewportPositionToScaled } from "../lib/position-conversion";
import { screenshot } from "../lib/screenshot";

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
      eventBus.on("pagesinit", this.onDocumentReady);
      eventBus.on("pagechanging", this.onPageChange);
      doc.addEventListener("keydown", this.handleKeyDown);
      doc.defaultView?.addEventListener("resize", this.debouncedScaleValue);
      if (observer) observer.observe(ref);

      this.unsubscribe = () => {
        eventBus.off("pagesinit", this.onDocumentReady);
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
    this.viewer.viewer?.classList.toggle(
      "PdfHighlighter--disable-selection",
      true
    );
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

  hideTipAndSelection = () => {
    this.setState({
      tipPosition: null,
      tipChildren: null,
    });
  };

  setTip(position: Position, inner: JSX.Element | null) {
    this.setState({
      tipPosition: position,
      tipChildren: inner,
    });
  }

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

    this.setState({
      scrolledToHighlightId: highlight.id,
    });

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

    this.setState({
      scrolledToHighlightId: EMPTY_ID,
    });

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

  selectionInProgress =
    !this.state.isCollapsed ||
    this.state.ghostHighlight ||
    this.state.isAreaSelectionInProgress;

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
                    this.setState({
                      ghostHighlight: { position: scaledPosition },
                    }),
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

              const scaledPosition = viewportPositionToScaled(
                viewportPosition,
                this.viewer
              );

              const image = screenshot(
                pageBoundingRect,
                pageBoundingRect.pageNumber,
                this.viewer
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
