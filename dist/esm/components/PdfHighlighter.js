var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import React, { PureComponent } from "react";
import ReactDom from "react-dom";
import debounce from "lodash.debounce";
import { EventBus, PDFViewer, PDFLinkService,
// @ts-ignore
 } from "pdfjs-dist/legacy/web/pdf_viewer";
import "pdfjs-dist/web/pdf_viewer.css";
import "../style/pdf_viewer.css";
import "../style/PdfHighlighter.css";
import getBoundingRect from "../lib/get-bounding-rect";
import getClientRects from "../lib/get-client-rects";
import getAreaAsPng from "../lib/get-area-as-png";
import { asElement, getPageFromRange, getPageFromElement, getWindow, findOrCreateContainerLayer, isHTMLElement, } from "../lib/pdfjs-dom";
import TipContainer from "./TipContainer";
import MouseSelection from "./MouseSelection";
import { scaledToViewport, viewportToScaled } from "../lib/coordinates";
const EMPTY_ID = "empty-id";
export class PdfHighlighter extends PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            ghostHighlight: null,
            isCollapsed: true,
            range: null,
            scrolledToHighlightId: EMPTY_ID,
            isAreaSelectionInProgress: false,
            tip: null,
            tipPosition: null,
            tipChildren: null,
        };
        this.eventBus = new EventBus();
        this.linkService = new PDFLinkService({
            eventBus: this.eventBus,
            externalLinkTarget: 2,
        });
        this.resizeObserver = null;
        this.containerNode = null;
        this.unsubscribe = () => { };
        this.attachRef = (ref) => {
            var _a;
            const { eventBus, resizeObserver: observer } = this;
            this.containerNode = ref;
            this.unsubscribe();
            if (ref) {
                const { ownerDocument: doc } = ref;
                eventBus.on("textlayerrendered", this.onTextLayerRendered);
                eventBus.on("pagesinit", this.onDocumentReady);
                doc.addEventListener("selectionchange", this.onSelectionChange);
                doc.addEventListener("keydown", this.handleKeyDown);
                (_a = doc.defaultView) === null || _a === void 0 ? void 0 : _a.addEventListener("resize", this.debouncedScaleValue);
                if (observer)
                    observer.observe(ref);
                this.unsubscribe = () => {
                    var _a;
                    eventBus.off("pagesinit", this.onDocumentReady);
                    eventBus.off("textlayerrendered", this.onTextLayerRendered);
                    doc.removeEventListener("selectionchange", this.onSelectionChange);
                    doc.removeEventListener("keydown", this.handleKeyDown);
                    (_a = doc.defaultView) === null || _a === void 0 ? void 0 : _a.removeEventListener("resize", this.debouncedScaleValue);
                    if (observer)
                        observer.disconnect();
                };
            }
        };
        this.hideTipAndSelection = () => {
            this.setState({
                tipPosition: null,
                tipChildren: null,
            });
            this.setState({ ghostHighlight: null, tip: null }, () => this.renderHighlights());
        };
        this.renderTip = () => {
            const { tipPosition, tipChildren } = this.state;
            if (!tipPosition)
                return null;
            const { boundingRect, pageNumber } = tipPosition;
            const page = {
                node: this.viewer.getPageView(pageNumber - 1).div,
            };
            return (React.createElement(TipContainer, { scrollTop: this.viewer.container.scrollTop, pageBoundingRect: page.node.getBoundingClientRect(), style: {
                    left: page.node.offsetLeft + boundingRect.left + boundingRect.width / 2,
                    top: boundingRect.top + page.node.offsetTop,
                    bottom: boundingRect.top + page.node.offsetTop + boundingRect.height,
                } }, tipChildren));
        };
        this.onTextLayerRendered = () => {
            this.renderHighlights();
        };
        this.scrollTo = (highlight) => {
            const { pageNumber, boundingRect, usePdfCoordinates } = highlight.position;
            this.viewer.container.removeEventListener("scroll", this.onScroll);
            const pageViewport = this.viewer.getPageView(pageNumber - 1).viewport;
            const scrollMargin = 10;
            this.viewer.scrollPageIntoView({
                pageNumber,
                destArray: [
                    null,
                    { name: "XYZ" },
                    ...pageViewport.convertToPdfPoint(0, scaledToViewport(boundingRect, pageViewport, usePdfCoordinates).top -
                        scrollMargin),
                    0,
                ],
            });
            this.setState({
                scrolledToHighlightId: highlight.id,
            }, () => this.renderHighlights());
            // wait for scrolling to finish
            setTimeout(() => {
                this.viewer.container.addEventListener("scroll", this.onScroll);
            }, 100);
        };
        this.onDocumentReady = () => {
            const { scrollRef } = this.props;
            this.handleScaleValue();
            scrollRef(this.scrollTo);
        };
        this.onSelectionChange = () => {
            const container = this.containerNode;
            const selection = getWindow(container).getSelection();
            if (!selection) {
                return;
            }
            const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            if (selection.isCollapsed) {
                this.setState({ isCollapsed: true });
                return;
            }
            if (!range ||
                !container ||
                !container.contains(range.commonAncestorContainer)) {
                return;
            }
            this.setState({
                isCollapsed: false,
                range,
            });
            this.debouncedAfterSelection();
        };
        this.onScroll = () => {
            const { onScrollChange } = this.props;
            onScrollChange();
            this.setState({
                scrolledToHighlightId: EMPTY_ID,
            }, () => this.renderHighlights());
            this.viewer.container.removeEventListener("scroll", this.onScroll);
        };
        this.onMouseDown = (event) => {
            if (!isHTMLElement(event.target)) {
                return;
            }
            if (asElement(event.target).closest(".PdfHighlighter__tip-container")) {
                return;
            }
            this.hideTipAndSelection();
        };
        this.handleKeyDown = (event) => {
            if (event.code === "Escape") {
                this.hideTipAndSelection();
            }
        };
        this.afterSelection = () => {
            const { onSelectionFinished } = this.props;
            const { isCollapsed, range } = this.state;
            if (!range || isCollapsed) {
                return;
            }
            const page = getPageFromRange(range);
            if (!page) {
                return;
            }
            const rects = getClientRects(range, page.node);
            if (rects.length === 0) {
                return;
            }
            const boundingRect = getBoundingRect(rects);
            const viewportPosition = { boundingRect, rects, pageNumber: page.number };
            function rangeToStringWithSpaces(range) {
                const ancestor = range.commonAncestorContainer;
                let array = [];
                /* If range has only one text node, then the startContainer
                will be the ancestor for the range. Treewalker works only on
                nodes under the root node. Extra empty space is added in order to
                streamline the string processing below.*/
                if (ancestor.nodeType === 3) {
                    array.push(`${range.startContainer.textContent} `);
                }
                else {
                    let node, 
                    /* A TreeWalker to find only textnodes whose parent is <span>
                    so that we don't have to traverse all the nodes under ancestor. */
                    walk = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, {
                        acceptNode: function (node2) {
                            const parent = node2.parentNode;
                            if ((parent === null || parent === void 0 ? void 0 : parent.nodeName) === "SPAN") {
                                return NodeFilter.FILTER_ACCEPT;
                            }
                            else
                                return NodeFilter.FILTER_REJECT;
                        },
                    });
                    /* We need a way to recognize where the textnodes within the range start.
                    But what if the startContainer is not within the nodes filtered by
                    TreeWalker? Then the textnodes in range must start immediately
                    at the beginning. Thus, isInRange must be set "true" at the outset.  */
                    let isInRange = range.startContainer.nodeType !== 3 ? true : false;
                    while ((node = walk.nextNode())) {
                        if (node === range.startContainer) {
                            isInRange = true;
                        }
                        if (isInRange && node.nodeType === 3) {
                            array.push(`${node.textContent} `);
                        }
                        if (node === range.endContainer) {
                            break;
                        }
                    }
                }
                /*These conditionals deal with the possibilities that
                that the start and end containers are not textnodes
                which would throw off the offset. Also, .length would not exist
                for endContainer. */
                const stringWithSpaces = array.join("");
                if (range.startContainer.nodeType !== 3 &&
                    range.endContainer.nodeType !== 3) {
                    return stringWithSpaces.trim();
                }
                else if (range.startContainer.nodeType !== 3) {
                    const slicedString = stringWithSpaces.slice(0, stringWithSpaces.length -
                        (range.endContainer.length - range.endOffset));
                    return slicedString;
                }
                else if (range.endContainer.nodeType !== 3) {
                    const slicedString = stringWithSpaces.slice(range.startOffset);
                    return slicedString.trim();
                }
                else {
                    const slicedString = stringWithSpaces.slice(range.startOffset, stringWithSpaces.length -
                        (range.endContainer.length - range.endOffset + 1));
                    return slicedString.trim();
                }
            }
            const content = {
                text: rangeToStringWithSpaces(range),
            };
            const scaledPosition = this.viewportPositionToScaled(viewportPosition);
            this.setTip(viewportPosition, onSelectionFinished(scaledPosition, content, () => this.hideTipAndSelection(), () => this.setState({
                ghostHighlight: { position: scaledPosition },
            }, () => this.renderHighlights())));
        };
        this.debouncedAfterSelection = debounce(this.afterSelection, 500);
        this.handleScaleValue = () => {
            if (this.viewer) {
                this.viewer.currentScaleValue = this.props.pdfScaleValue; //"page-width";
            }
        };
        this.debouncedScaleValue = debounce(this.handleScaleValue, 500);
        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(this.debouncedScaleValue);
        }
    }
    componentDidMount() {
        this.init();
    }
    componentDidUpdate(prevProps) {
        if (prevProps.pdfDocument !== this.props.pdfDocument) {
            this.init();
            return;
        }
        if (prevProps.highlights !== this.props.highlights) {
            this.renderHighlights(this.props);
        }
    }
    init() {
        const { pdfDocument } = this.props;
        this.viewer =
            this.viewer ||
                new PDFViewer({
                    container: this.containerNode,
                    eventBus: this.eventBus,
                    enhanceTextSelection: true,
                    removePageBorders: true,
                    linkService: this.linkService,
                });
        this.linkService.setDocument(pdfDocument);
        this.linkService.setViewer(this.viewer);
        this.viewer.setDocument(pdfDocument);
        // debug
        window.PdfViewer = this;
    }
    componentWillUnmount() {
        this.unsubscribe();
    }
    findOrCreateHighlightLayer(page) {
        const { textLayer } = this.viewer.getPageView(page - 1) || {};
        if (!textLayer) {
            return null;
        }
        return findOrCreateContainerLayer(textLayer.textLayerDiv, "PdfHighlighter__highlight-layer");
    }
    groupHighlightsByPage(highlights) {
        const { ghostHighlight } = this.state;
        return [...highlights, ghostHighlight]
            .filter(Boolean)
            .reduce((res, highlight) => {
            const { pageNumber } = highlight.position;
            res[pageNumber] = res[pageNumber] || [];
            res[pageNumber].push(highlight);
            return res;
        }, {});
    }
    showTip(highlight, content) {
        const { isCollapsed, ghostHighlight, isAreaSelectionInProgress } = this.state;
        const highlightInProgress = !isCollapsed || ghostHighlight;
        if (highlightInProgress || isAreaSelectionInProgress) {
            return;
        }
        this.setTip(highlight.position, content);
    }
    scaledPositionToViewport({ pageNumber, boundingRect, rects, usePdfCoordinates, }) {
        const viewport = this.viewer.getPageView(pageNumber - 1).viewport;
        return {
            boundingRect: scaledToViewport(boundingRect, viewport, usePdfCoordinates),
            rects: (rects || []).map((rect) => scaledToViewport(rect, viewport, usePdfCoordinates)),
            pageNumber,
        };
    }
    viewportPositionToScaled({ pageNumber, boundingRect, rects, }) {
        const viewport = this.viewer.getPageView(pageNumber - 1).viewport;
        return {
            boundingRect: viewportToScaled(boundingRect, viewport),
            rects: (rects || []).map((rect) => viewportToScaled(rect, viewport)),
            pageNumber,
        };
    }
    screenshot(position, pageNumber) {
        const canvas = this.viewer.getPageView(pageNumber - 1).canvas;
        return getAreaAsPng(canvas, position);
    }
    renderHighlights(nextProps) {
        const { highlightTransform, highlights } = nextProps || this.props;
        const { pdfDocument } = this.props;
        const { tip, scrolledToHighlightId } = this.state;
        const highlightsByPage = this.groupHighlightsByPage(highlights);
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
            const highlightLayer = this.findOrCreateHighlightLayer(pageNumber);
            if (highlightLayer) {
                ReactDom.render(React.createElement("div", null, (highlightsByPage[String(pageNumber)] || []).map((_a, index) => {
                    var { position, id } = _a, highlight = __rest(_a, ["position", "id"]);
                    // @ts-ignore
                    const viewportHighlight = Object.assign({ id, position: this.scaledPositionToViewport(position) }, highlight);
                    if (tip && tip.highlight.id === String(id)) {
                        this.showTip(tip.highlight, tip.callback(viewportHighlight));
                    }
                    const isScrolledTo = Boolean(scrolledToHighlightId === id);
                    return highlightTransform(viewportHighlight, index, (highlight, callback) => {
                        this.setState({
                            tip: { highlight, callback },
                        });
                        this.showTip(highlight, callback(highlight));
                    }, this.hideTipAndSelection, (rect) => {
                        const viewport = this.viewer.getPageView(pageNumber - 1).viewport;
                        return viewportToScaled(rect, viewport);
                    }, (boundingRect) => this.screenshot(boundingRect, pageNumber), isScrolledTo);
                })), highlightLayer);
            }
        }
    }
    setTip(position, inner) {
        this.setState({
            tipPosition: position,
            tipChildren: inner,
        });
    }
    toggleTextSelection(flag) {
        this.viewer.viewer.classList.toggle("PdfHighlighter--disable-selection", flag);
    }
    render() {
        const { onSelectionFinished, enableAreaSelection } = this.props;
        return (React.createElement("div", { onPointerDown: this.onMouseDown },
            React.createElement("div", { ref: this.attachRef, className: "PdfHighlighter", onContextMenu: (e) => e.preventDefault() },
                React.createElement("div", { className: "pdfViewer" }),
                this.renderTip(),
                typeof enableAreaSelection === "function" ? (React.createElement(MouseSelection, { onDragStart: () => this.toggleTextSelection(true), onDragEnd: () => this.toggleTextSelection(false), onChange: (isVisible) => this.setState({ isAreaSelectionInProgress: isVisible }), shouldStart: (event) => enableAreaSelection(event) &&
                        isHTMLElement(event.target) &&
                        Boolean(asElement(event.target).closest(".page")), onSelection: (startTarget, boundingRect, resetSelection) => {
                        const page = getPageFromElement(startTarget);
                        if (!page) {
                            return;
                        }
                        const pageBoundingRect = Object.assign(Object.assign({}, boundingRect), { top: boundingRect.top - page.node.offsetTop, left: boundingRect.left - page.node.offsetLeft });
                        const viewportPosition = {
                            boundingRect: pageBoundingRect,
                            rects: [],
                            pageNumber: page.number,
                        };
                        const scaledPosition = this.viewportPositionToScaled(viewportPosition);
                        const image = this.screenshot(pageBoundingRect, page.number);
                        this.setTip(viewportPosition, onSelectionFinished(scaledPosition, { image }, () => this.hideTipAndSelection(), () => this.setState({
                            ghostHighlight: {
                                position: scaledPosition,
                                content: { image },
                            },
                        }, () => {
                            resetSelection();
                            this.renderHighlights();
                        })));
                    } })) : null)));
    }
}
PdfHighlighter.defaultProps = {
    pdfScaleValue: "auto",
};
//# sourceMappingURL=PdfHighlighter.js.map