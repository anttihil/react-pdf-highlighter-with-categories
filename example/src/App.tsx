import React, { Component } from "react";

import {
  PdfLoader,
  PdfHighlighter,
  Tip,
  Highlight,
  Popup,
  AreaHighlight,
  SelectionType,
} from "./react-pdf-highlighter";

import type { IHighlight, NewHighlight } from "./react-pdf-highlighter";

import { testHighlights as _testHighlights } from "./test-highlights";
import { Spinner } from "./Spinner";
import { Sidebar } from "./Sidebar";

import "./style/App.css";

const testHighlights: Record<string, Array<IHighlight>> = _testHighlights;

interface State {
  data: Uint8Array | null;
  url: string;
  highlights: Array<IHighlight>;
  categoryLabels: Array<{ label: string; background: string }>;
  destinationPage: number;
  pageCount: number;
  currentPage: number;
  selectionType: SelectionType;
}

const getNextId = () => String(Math.random()).slice(2);

const parseIdFromHash = () =>
  document.location.hash.slice("#highlight-".length);

const resetHash = () => {
  document.location.hash = "";
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

const PRIMARY_PDF_URL = "https://arxiv.org/pdf/1708.08021.pdf";
const SECONDARY_PDF_URL = "https://arxiv.org/pdf/1604.02480.pdf";

const searchParams = new URLSearchParams(document.location.search);

const initialUrl = searchParams.get("url") || PRIMARY_PDF_URL;

class App extends Component<{}, State> {
  state: State = {
    data: null,
    url: initialUrl,
    highlights: testHighlights[initialUrl]
      ? [...testHighlights[initialUrl]]
      : [],
    categoryLabels: [
      { label: "Assumption", background: "#95c7e0" },
      { label: "Premise", background: "#609b91" },
      { label: "Target", background: "#ce7e8b" },
    ],
    destinationPage: 1,
    pageCount: 0,
    currentPage: 1,
    selectionType: "",
  };

  resetHighlights = () => {
    this.setState({
      highlights: [],
    });
  };

  setCategoryLabels = (update: { label: string; background: string }[]) => {
    this.setState((prev) => {
      return { ...prev, categoryLabels: update };
    });
  };

  toggleDocument = () => {
    const newUrl =
      this.state.url === PRIMARY_PDF_URL ? SECONDARY_PDF_URL : PRIMARY_PDF_URL;

    this.setState({
      url: newUrl,
      highlights: testHighlights[newUrl] ? [...testHighlights[newUrl]] : [],
    });
  };

  scrollViewerTo = (highlight: any) => {};

  scrollToHighlightFromHash = () => {
    const highlight = this.getHighlightById(parseIdFromHash());

    if (highlight) {
      this.scrollViewerTo(highlight);
    }
  };

  componentDidMount() {
    window.addEventListener(
      "hashchange",
      this.scrollToHighlightFromHash,
      false
    );
  }

  getHighlightById(id: string) {
    const { highlights } = this.state;

    return highlights.find((highlight) => highlight.id === id);
  }

  addHighlight(highlight: NewHighlight) {
    const { highlights } = this.state;

    console.log("Saving highlight", highlight);

    this.setState({
      highlights: [{ ...highlight, id: getNextId() }, ...highlights],
    });
  }

  updateHighlight(highlightId: string, position: Object, content: Object) {
    console.log("Updating highlight", highlightId, position, content);

    this.setState({
      highlights: this.state.highlights.map((h) => {
        const {
          id,
          position: originalPosition,
          content: originalContent,
          ...rest
        } = h;
        return id === highlightId
          ? {
              id,
              position: { ...originalPosition, ...position },
              content: { ...originalContent, ...content },
              ...rest,
            }
          : h;
      }),
    });
  }

  render() {
    const { url, highlights, data, selectionType } = this.state;
    return (
      <div className="App" style={{ display: "flex", height: "100vh" }}>
        <div
          style={{
            position: "absolute",
            left: "10px",
            display: "flex",
            gap: "10px",
            zIndex: 100,
          }}
        >
          <button
            style={{
              width: "70px",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
            }}
            onClick={() =>
              this.setState(({ currentPage }) => ({
                destinationPage: currentPage > 1 ? currentPage - 1 : 1,
              }))
            }
          >
            Decrease
          </button>
          <div
            style={{
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
              textAlign: "center",
              padding: "0 5px",
            }}
          >
            {"Current page: " + this.state.currentPage}
          </div>
          <button
            style={{
              width: "70px",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
            }}
            onClick={() =>
              this.setState(({ currentPage }) => ({
                destinationPage:
                  currentPage < this.state.pageCount
                    ? currentPage + 1
                    : currentPage,
              }))
            }
          >
            Increase
          </button>
          <div
            style={{
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
              textAlign: "center",
              padding: "0 5px",
            }}
          >
            {"Pages: " + this.state.pageCount}
          </div>
          <button
            style={{
              width: "auto",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
            }}
            onClick={() => this.setState({ destinationPage: 1 })}
          >
            Back to Page 1
          </button>
          <button
            style={{
              width: "auto",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
              color: selectionType === "area" ? "white" : "black",
            }}
            onClick={() => this.setState({ selectionType: "area" })}
          >
            Area Selection
          </button>
          <button
            style={{
              width: "auto",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
              color: selectionType === "text" ? "white" : "black",
            }}
            onClick={() => this.setState({ selectionType: "text" })}
          >
            Text Selection
          </button>
          <button
            style={{
              width: "auto",
              minHeight: "20px",
              backgroundColor: "grey",
              borderRadius: "5px",
            }}
            onClick={() => {
              this.setState({ selectionType: "" });
            }}
          >
            Reset Selection
          </button>
        </div>
        <Sidebar
          highlights={highlights}
          resetHighlights={this.resetHighlights}
          toggleDocument={this.toggleDocument}
          categoryLabels={this.state.categoryLabels}
          setCategoryLabels={this.setCategoryLabels}
          setPdfUrl={(url) => {
            this.setState({ url, data: null, highlights: [] });
          }}
          setPdfData={(data) => {
            this.setState({ data, url: "", highlights: [] });
          }}
        />
        <div
          style={{
            height: "100vh",
            width: "75vw",
            position: "relative",
          }}
        >
          <PdfLoader url={url} beforeLoad={<Spinner />} data={data}>
            {(pdfDocument) => (
              <PdfHighlighter
                categoryLabels={this.state.categoryLabels}
                pdfDocument={pdfDocument}
                selectionType={selectionType}
                setSelectionType={(value) =>
                  this.setState({ selectionType: value })
                }
                onScrollChange={resetHash}
                // pdfScaleValue="page-width"
                scrollRef={(scrollTo) => {
                  this.scrollViewerTo = scrollTo;

                  this.scrollToHighlightFromHash();
                }}
                destinationPage={this.state.destinationPage}
                getPageCount={(pageCount) => {
                  this.setState({ pageCount });
                }}
                getCurrentPage={(currentPage) => {
                  this.setState({ currentPage });
                }}
                onSelectionFinished={(
                  position,
                  content,
                  hideTipAndSelection,
                  transformSelection,
                  categoryLabels
                ) => (
                  <Tip
                    onOpen={transformSelection}
                    onConfirm={(comment) => {
                      this.addHighlight({ content, position, comment });

                      hideTipAndSelection();
                    }}
                    categoryLabels={categoryLabels}
                  />
                )}
                highlightTransform={(
                  highlight,
                  index,
                  setTip,
                  hideTip,
                  viewportToScaled,
                  screenshot,
                  isScrolledTo
                ) => {
                  const isTextHighlight = !Boolean(
                    highlight.content && highlight.content.image
                  );

                  const component = isTextHighlight ? (
                    <Highlight
                      isScrolledTo={isScrolledTo}
                      position={highlight.position}
                      comment={highlight.comment}
                      categoryLabels={this.state.categoryLabels}
                    />
                  ) : (
                    <AreaHighlight
                      isScrolledTo={isScrolledTo}
                      highlight={highlight}
                      onChange={(boundingRect) => {
                        this.updateHighlight(
                          highlight.id,
                          { boundingRect: viewportToScaled(boundingRect) },
                          { image: screenshot(boundingRect) }
                        );
                      }}
                      comment={highlight.comment}
                      categoryLabels={this.state.categoryLabels}
                    />
                  );

                  return (
                    <Popup
                      popupContent={<HighlightPopup {...highlight} />}
                      onMouseOver={(popupContent) =>
                        setTip(highlight, (highlight) => popupContent)
                      }
                      onMouseOut={hideTip}
                      key={index}
                      children={component}
                    />
                  );
                }}
                highlights={highlights}
              />
            )}
          </PdfLoader>
        </div>
      </div>
    );
  }
}

export default App;
